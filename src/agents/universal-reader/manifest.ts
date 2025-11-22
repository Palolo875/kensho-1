export const universalReaderManifest = {
    name: 'UniversalReaderAgent',
    description: 'Un expert en lecture de documents. Utilise cet outil pour extraire le texte de fichiers PDF (natifs ou scannés) ou d\'images (PNG, JPG). Il peut gérer des documents très longs en générant automatiquement un résumé.',
    methods: [{
        name: 'read',
        description: 'Lit un fichier et retourne son contenu textuel, potentiellement résumé.',
        args: [
            { name: 'fileBuffer', type: 'ArrayBuffer', description: 'Le contenu binaire du fichier à lire.' },
            { name: 'fileType', type: 'string', description: 'Le type MIME du fichier (ex: "application/pdf").' }
        ],
        returns: {
            type: 'object',
            description: 'Un objet contenant le texte et des métadonnées.',
            properties: {
                fullText: { type: 'string', description: 'Le texte complet extrait.' },
                summary: { type: 'string', description: 'Un résumé du texte, si le document était trop long.' },
                wasSummarized: { type: 'boolean', description: 'Vrai si un résumé a été généré.' },
                metadata: { type: 'object', description: 'Informations sur le processus de lecture (method, processingTime, confidence, etc.).' }
            }
        }
    }]
};
