/**
 * WebGPU Type Definitions
 *
 * Minimal type definitions for WebGPU API used by RuntimeManager
 * for GPU detection and capability checking.
 *
 * @see https://www.w3.org/TR/webgpu/
 */

interface GPUAdapterInfo {
  readonly vendor: string;
  readonly architecture: string;
  readonly device: string;
  readonly description: string;
}

interface GPUAdapter {
  readonly features: ReadonlySet<string>;
  readonly limits: Record<string, number>;
  readonly isFallbackAdapter: boolean;

  requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
  requestAdapterInfo(unmaskHints?: string[]): Promise<GPUAdapterInfo>;
}

interface GPUDeviceDescriptor {
  label?: string;
  requiredFeatures?: string[];
  requiredLimits?: Record<string, number>;
}

interface GPUDevice extends EventTarget {
  readonly features: ReadonlySet<string>;
  readonly limits: Record<string, number>;
  readonly queue: GPUQueue;
  readonly lost: Promise<GPUDeviceLostInfo>;
  readonly label: string;

  destroy(): void;
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
  createSampler(descriptor?: GPUSamplerDescriptor): GPUSampler;
  createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout;
  createPipelineLayout(descriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout;
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline;
  createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
  createComputePipelineAsync(descriptor: GPUComputePipelineDescriptor): Promise<GPUComputePipeline>;
  createRenderPipelineAsync(descriptor: GPURenderPipelineDescriptor): Promise<GPURenderPipeline>;
  createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder;
  createRenderBundleEncoder(descriptor: GPURenderBundleEncoderDescriptor): GPURenderBundleEncoder;
  createQuerySet(descriptor: GPUQuerySetDescriptor): GPUQuerySet;
}

interface GPUDeviceLostInfo {
  readonly reason: 'unknown' | 'destroyed';
  readonly message: string;
}

// Minimal interfaces for type compatibility
interface GPUQueue {}
interface GPUBuffer {}
interface GPUTexture {}
interface GPUSampler {}
interface GPUBindGroupLayout {}
interface GPUPipelineLayout {}
interface GPUBindGroup {}
interface GPUShaderModule {}
interface GPUComputePipeline {}
interface GPURenderPipeline {}
interface GPUCommandEncoder {}
interface GPURenderBundleEncoder {}
interface GPUQuerySet {}

interface GPUBufferDescriptor {}
interface GPUTextureDescriptor {}
interface GPUSamplerDescriptor {}
interface GPUBindGroupLayoutDescriptor {}
interface GPUPipelineLayoutDescriptor {}
interface GPUBindGroupDescriptor {}
interface GPUShaderModuleDescriptor {}
interface GPUComputePipelineDescriptor {}
interface GPURenderPipelineDescriptor {}
interface GPUCommandEncoderDescriptor {}
interface GPURenderBundleEncoderDescriptor {}
interface GPUQuerySetDescriptor {}

interface GPURequestAdapterOptions {
  powerPreference?: 'low-power' | 'high-performance';
  forceFallbackAdapter?: boolean;
}

interface GPU {
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): string;
}

declare global {
  interface Navigator {
    readonly gpu?: GPU;
  }

  interface WorkerNavigator {
    readonly gpu?: GPU;
  }
}

export {};
