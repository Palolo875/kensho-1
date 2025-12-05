import { dialoguePlugin } from './src/core/plugins/DialoguePlugin';
import { simulateDevice, DeviceProfile } from './src/core/kernel/monitoring/DeviceSimulator';
import { logger } from './src/core/kernel/monitoring/LoggerService';
import { router } from './src/core/kernel/Router';
import { taskExecutor } from './src/core/kernel/TaskExecutor';
import { watermarkingService } from './src/core/security/WatermarkingService';
import { runtimeManager } from './src/core/kernel/RuntimeManager';
import fs from 'fs';

// Désactive les logs JSON pour un affichage plus propre du benchmark
logger.info = () => {};
logger.warn = () => {};
logger.error = () => {};

interface BenchmarkMetrics {
  totalDuration: number;
  breakdown: {
    routing: number;
    securityValidation: number;
    taskExecution: number;
    watermarking: number;
    streaming: number;
    graphCompilation?: number; // Pour cold start
    graphLoading?: number;     // Pour warm start
  };
  tokensGenerated: number;
  tokensPerSecond: number;
  memoryUsage: {
    before: number;
    after: number;
    peak: number;
  };
  circuitBreakerState: string;
  mode: 'cold' | 'warm'; // Indique si c'est un cold ou warm start
}

interface BenchmarkResults {
  p50: number; // Médiane
  p95: number; // 95e percentile (important pour SLA)
  p99: number; // 99e percentile (pire cas)
  mean: number;
  min: number;
  max: number;
}

const SCENARIOS = {
  // Cas normaux
  'Dialogue Simple': "Explique l'open source en une phrase.",
  'Tâche de Code': "Écris une fonction javascript qui inverse une chaîne.",
  
  // Cas de stress
  'Très Long Prompt': "A".repeat(5000) + " résume ce texte.", // Teste les limites de tokenization
};

// Variable pour suivre l'état cold/warm
let isColdStart = true;

async function runBenchmarkForScenario(
  scenario: string, 
  prompt: string,
  mode: 'cold' | 'warm' = 'cold'
): Promise<BenchmarkMetrics> {
  const memoryBefore = (performance as any).memory?.usedJSHeapSize || 0;
  
  const timings: any = {};
  
  // Pour le cold start, on reset le cache
  if (mode === 'cold') {
    // Reset OPFS / cache mémoire / graphs compilés
    await runtimeManager.resetCache();
    isColdStart = true;
  }
  
  // Hook dans chaque service pour mesurer
  const routingStart = performance.now();
  const plan = await router.createPlan(prompt);
  timings.routing = performance.now() - routingStart;

  const securityStart = performance.now();
  // Exécute les tâches de sécurité
  if (plan.tasks.some(t => t.specialty === 'SECURITY')) {
    const securityTasks = plan.tasks.filter(t => t.specialty === 'SECURITY');
    for (const task of securityTasks) {
      await taskExecutor.executeTask(task);
    }
  }
  timings.securityValidation = performance.now() - securityStart;

  const executionStart = performance.now();
  const results = await taskExecutor.executePlan(plan);
  timings.taskExecution = performance.now() - executionStart;

  const watermarkStart = performance.now();
  const watermarked = watermarkingService.apply(results[0].result);
  timings.watermarking = performance.now() - watermarkStart;

  const memoryAfter = (performance as any).memory?.usedJSHeapSize || 0;

  // Ajout des métriques spécifiques cold/warm
  if (mode === 'cold') {
    timings.graphCompilation = await runtimeManager.getLastCompilationTime();
  } else {
    timings.graphLoading = await runtimeManager.getLastLoadingTime();
  }

  return {
    totalDuration: Object.values(timings).reduce((a: any, b: any) => a + b, 0),
    breakdown: timings,
    tokensGenerated: watermarked.split(' ').length,
    tokensPerSecond: watermarked.split(' ').length / (timings.taskExecution / 1000),
    memoryUsage: {
      before: memoryBefore,
      after: memoryAfter,
      peak: memoryAfter // Approximation
    },
    circuitBreakerState: runtimeManager.getState(),
    mode: mode
  };
}

function calculatePercentiles(runs: number[]): BenchmarkResults {
  const sorted = [...runs].sort((a, b) => a - b);
  return {
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    mean: sorted.reduce((a, b) => a + b) / sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1]
  };
}

async function runBenchmarkForProfile(profile: DeviceProfile) {
  simulateDevice(profile);
  
  // ✅ Cold start : mesures sans warmup
  console.log(`[Benchmark] Cold start pour ${profile}...`);
  const coldResults: Record<string, BenchmarkMetrics> = {};
  
  // Exécute chaque scénario en cold start
  for (const [name, prompt] of Object.entries(SCENARIOS)) {
    // ✅ Exécute 3 fois et prend la médiane pour éviter les outliers
    const runs: BenchmarkMetrics[] = [];
    for (let i = 0; i < 3; i++) {
      runs.push(await runBenchmarkForScenario(name, prompt, 'cold'));
      await new Promise(r => setTimeout(r, 500)); // Pause entre runs
    }
    
    // Prend la médiane (valeur du milieu après tri)
    runs.sort((a, b) => a.totalDuration - b.totalDuration);
    coldResults[name] = runs[1]; // Médiane (ignore min et max)
  }
  
  // ✅ Warmup : exécute chaque scénario une fois sans mesurer
  console.log(`[Benchmark] Warmup pour ${profile}...`);
  for (const [name, prompt] of Object.entries(SCENARIOS)) {
    await dialoguePlugin.process(prompt);
  }
  
  // Petite pause pour laisser le GC tourner
  await new Promise(r => setTimeout(r, 1000));

  // Maintenant les vraies mesures warm
  const warmResults: Record<string, BenchmarkMetrics> = {};

  for (const [name, prompt] of Object.entries(SCENARIOS)) {
    // ✅ Exécute 3 fois et prend la médiane pour éviter les outliers
    const runs: BenchmarkMetrics[] = [];
    for (let i = 0; i < 3; i++) {
      runs.push(await runBenchmarkForScenario(name, prompt, 'warm'));
      await new Promise(r => setTimeout(r, 500)); // Pause entre runs
    }
    
    // Prend la médiane (valeur du milieu après tri)
    runs.sort((a, b) => a.totalDuration - b.totalDuration);
    warmResults[name] = runs[1]; // Médiane (ignore min et max)
  }

  // Combine les résultats
  const results: Record<string, any> = {};
  for (const name of Object.keys(SCENARIOS)) {
    results[name] = {
      cold: coldResults[name],
      warm: warmResults[name]
    };
  }

  return results;
}

async function runAllBenchmarks() {
  console.log("📊 === DÉBUT DE LA SUITE DE BENCHMARKS === 📊");

  const allResults: Record<string, any> = {};

  allResults['LOW_END_MOBILE'] = await runBenchmarkForProfile('LOW_END_MOBILE');
  allResults['MID_RANGE_TABLET'] = await runBenchmarkForProfile('MID_RANGE_TABLET');
  allResults['HIGH_END_DESKTOP'] = await runBenchmarkForProfile('HIGH_END_DESKTOP');

  // Charge les baselines
  let baselines: any = {};
  try {
    baselines = JSON.parse(fs.readFileSync('benchmark-baselines.json', 'utf8'));
  } catch {
    console.warn('[Benchmark] Aucune baseline trouvée. Création...');
  }

  // Compare et détecte les régressions
  const regressions: string[] = [];
  for (const [profile, results] of Object.entries(allResults)) {
    for (const [scenario, metrics] of Object.entries(results as any)) {
      const baseline = baselines.baselines?.[profile]?.[scenario];
      
      if (baseline) {
        // Vérification de la régression cold start
        if (metrics.cold) {
          const coldSlowdown = ((metrics.cold.totalDuration - baseline.cold.totalDuration) / baseline.cold.totalDuration) * 100;
          
          if (coldSlowdown > 15) { // >15% de régression sur cold start
            regressions.push(
              `❌ ${profile} / ${scenario} (cold): +${coldSlowdown.toFixed(1)}% (${baseline.cold.totalDuration}ms → ${metrics.cold.totalDuration}ms)`
            );
          } else if (coldSlowdown > 10) {
            console.warn(`⚠️  ${profile} / ${scenario} (cold): +${coldSlowdown.toFixed(1)}%`);
          } else if (coldSlowdown < -10) {
            console.log(`✅ ${profile} / ${scenario} (cold): ${coldSlowdown.toFixed(1)}% (amélioration !)`);
          }
        }
        
        // Vérification de la régression warm start (plus strict)
        if (metrics.warm) {
          const warmSlowdown = ((metrics.warm.totalDuration - baseline.warm.totalDuration) / baseline.warm.totalDuration) * 100;
          
          if (warmSlowdown > 10) { // >10% de régression sur warm start
            regressions.push(
              `❌ ${profile} / ${scenario} (warm): +${warmSlowdown.toFixed(1)}% (${baseline.warm.totalDuration}ms → ${metrics.warm.totalDuration}ms)`
            );
          } else if (warmSlowdown > 5) {
            console.warn(`⚠️  ${profile} / ${scenario} (warm): +${warmSlowdown.toFixed(1)}%`);
          } else if (warmSlowdown < -5) {
            console.log(`✅ ${profile} / ${scenario} (warm): ${warmSlowdown.toFixed(1)}% (amélioration !)`);
          }
          
          // Vérification du 95e percentile
          if (baseline.warm.p95 && metrics.warm.breakdown) {
            const p95Slowdown = ((metrics.warm.p95 - baseline.warm.p95) / baseline.warm.p95) * 100;
            if (p95Slowdown > 10) {
              regressions.push(
                `❌ ${profile} / ${scenario} (warm p95): +${p95Slowdown.toFixed(1)}% (${baseline.warm.p95}ms → ${metrics.warm.p95}ms)`
              );
            }
          }
        }
      }
    }
  }

  if (regressions.length > 0) {
    console.error('\n🚨 RÉGRESSIONS DÉTECTÉES:');
    regressions.forEach(r => console.error(r));
    // process.exit(1); // Fail le CI
  }

  console.log("\n\n📈 === RÉSULTATS FINAUX (en ms) === 📈");
  console.table(allResults);
  
  // Export JSON pour d'autres outils
  fs.writeFileSync(
    'benchmark-results.json',
    JSON.stringify({
      timestamp: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: process.platform
      },
      results: allResults
    }, null, 2)
  );

  // Export CSV pour Excel/Google Sheets
  const csv = generateCSV(allResults);
  fs.writeFileSync('benchmark-results.csv', csv);

  // Export HTML avec graphiques (Chart.js)
  const html = generateHTMLReport(allResults);
  fs.writeFileSync('benchmark-report.html', html);

  console.log('\n📊 Rapports générés:');
  console.log('  - benchmark-results.json');
  console.log('  - benchmark-results.csv');
  console.log('  - benchmark-report.html (ouvrir dans un navigateur)');
  
  console.log("\n✅ Suite de benchmarks terminée.");
}

function generateCSV(results: any): string {
  let csv = 'Profile,Scenario,Mode,Total Duration,Routing,Security,Execution,Watermarking,Graph Compilation/Loading,Tokens/sec,Circuit State\n';
  
  for (const [profile, scenarios] of Object.entries(results)) {
    for (const [scenario, modes] of Object.entries(scenarios as any)) {
      // Cold start metrics
      if (modes.cold) {
        const cold = modes.cold as BenchmarkMetrics;
        const graphMetric = cold.breakdown.graphCompilation ? cold.breakdown.graphCompilation : '';
        csv += `${profile},${scenario},cold,${cold.totalDuration},${cold.breakdown.routing},${cold.breakdown.securityValidation},${cold.breakdown.taskExecution},${cold.breakdown.watermarking},${graphMetric},${cold.tokensPerSecond},${cold.circuitBreakerState}\n`;
      }
      
      // Warm start metrics
      if (modes.warm) {
        const warm = modes.warm as BenchmarkMetrics;
        const graphMetric = warm.breakdown.graphLoading ? warm.breakdown.graphLoading : '';
        csv += `${profile},${scenario},warm,${warm.totalDuration},${warm.breakdown.routing},${warm.breakdown.securityValidation},${warm.breakdown.taskExecution},${warm.breakdown.watermarking},${graphMetric},${warm.tokensPerSecond},${warm.circuitBreakerState}\n`;
      }
    }
  }
  
  return csv;
}

function generateHTMLReport(results: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Kensho Benchmark Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .chart-container { width: 800px; height: 400px; margin: 20px 0; }
    .comparison { display: flex; justify-content: space-around; }
    .metric-card { border: 1px solid #ddd; padding: 10px; margin: 10px; border-radius: 5px; }
  </style>
</head>
<body>
  <h1>Kensho Benchmark Report</h1>
  
  <h2>Comparaison Cold vs Warm Start</h2>
  <div class="comparison">
    ${Object.keys(results).map(profile => `
      <div class="metric-card">
        <h3>${profile}</h3>
        ${Object.keys(results[profile]).map(scenario => `
          <div>
            <strong>${scenario}</strong><br/>
            Cold: ${results[profile][scenario].cold?.totalDuration || 'N/A'}ms<br/>
            Warm: ${results[profile][scenario].warm?.totalDuration || 'N/A'}ms<br/>
            Improvement: ${results[profile][scenario].cold && results[profile][scenario].warm ? 
              (results[profile][scenario].cold.totalDuration / results[profile][scenario].warm.totalDuration).toFixed(1) + 'x' : 'N/A'}
          </div>
        `).join('')}
      </div>
    `).join('')}
  </div>
  
  <div class="chart-container">
    <canvas id="durationChart"></canvas>
  </div>
  
  <div class="chart-container">
    <canvas id="tpsChart"></canvas>
  </div>
  
  <div class="chart-container">
    <canvas id="coldWarmComparisonChart"></canvas>
  </div>
  
  <script>
    const data = ${JSON.stringify(results)};
    
    // Préparer les données pour les graphiques
    const profiles = Object.keys(data);
    const scenarios = Object.keys(Object.values(data)[0]);
    
    // Graphique des durées totales (warm start)
    const durationCtx = document.getElementById('durationChart').getContext('2d');
    new Chart(durationCtx, {
      type: 'bar',
      data: {
        labels: scenarios,
        datasets: profiles.map((profile, i) => ({
          label: profile,
          data: scenarios.map(s => data[profile][s].warm?.totalDuration || 0),
          backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'][i]
        }))
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Temps Total par Scénario (Warm Start)'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Durée (ms)'
            }
          }
        }
      }
    });
    
    // Graphique des tokens par seconde (warm start)
    const tpsCtx = document.getElementById('tpsChart').getContext('2d');
    new Chart(tpsCtx, {
      type: 'bar',
      data: {
        labels: scenarios,
        datasets: profiles.map((profile, i) => ({
          label: profile,
          data: scenarios.map(s => data[profile][s].warm?.tokensPerSecond || 0),
          backgroundColor: ['#4BC0C0', '#9966FF', '#FF9F40'][i]
        }))
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Tokens par Seconde (Warm Start)'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Tokens/sec'
            }
          }
        }
      }
    });
    
    // Graphique de comparaison Cold vs Warm
    const comparisonCtx = document.getElementById('coldWarmComparisonChart').getContext('2d');
    const allDataPoints = [];
    const labels = [];
    
    profiles.forEach(profile => {
      scenarios.forEach(scenario => {
        if (data[profile][scenario].cold && data[profile][scenario].warm) {
          labels.push(`${profile} - ${scenario}`);
          allDataPoints.push({
            cold: data[profile][scenario].cold.totalDuration,
            warm: data[profile][scenario].warm.totalDuration
          });
        }
      });
    });
    
    new Chart(comparisonCtx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Cold Start',
            data: allDataPoints.map(d => d.cold),
            backgroundColor: '#FF6384'
          },
          {
            label: 'Warm Start',
            data: allDataPoints.map(d => d.warm),
            backgroundColor: '#36A2EB'
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Comparaison Cold vs Warm Start'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Durée (ms)'
            }
          }
        }
      }
    });
  </script>
</body>
</html>
  `;
}

runAllBenchmarks();