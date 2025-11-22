export const universalReaderManifest = {
    name: 'UniversalReaderAgent',
    description: 'Un expert en lecture de documents. Utilise cet outil pour extraire le texte de fichiers PDF (natifs ou scannés) ou d\'images (PNG, JPG).',
    methods: [{
        name: 'read',
        description: 'Lit un fichier et retourne son contenu textuel.',
        args: [
            { name: 'fileBuffer', type: 'ArrayBuffer' },
            { name: 'fileType', type: 'string', description: 'Le type MIME du fichier (ex: "application/pdf").' }
        ]
    }]
};
