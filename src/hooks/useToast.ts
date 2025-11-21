import { toast } from 'sonner';

/**
 * Hook personnalisé pour afficher des notifications toast
 * Utilise la librairie Sonner qui est déjà installée
 */
export const useToast = () => ({
    /**
     * Affiche un toast de succès
     */
    success: (message: string, description?: string) => {
        return toast.success(message, {
            description,
            duration: 4000,
        });
    },

    /**
     * Affiche un toast d'erreur
     */
    error: (message: string, description?: string) => {
        return toast.error(message, {
            description,
            duration: 6000, // Erreurs restent plus longtemps
        });
    },

    /**
     * Affiche un toast informatif
     */
    info: (message: string, description?: string) => {
        return toast.info(message, {
            description,
            duration: 4000,
        });
    },

    /**
     * Affiche un toast d'avertissement
     */
    warning: (message: string, description?: string) => {
        return toast.warning(message, {
            description,
            duration: 5000,
        });
    },

    /**
     * Affiche un toast de chargement
     */
    loading: (message: string) => {
        return toast.loading(message);
    },

    /**
     * Dismiss un toast spécifique ou tous les toasts
     */
    dismiss: (toastId?: string | number) => {
        toast.dismiss(toastId);
    },
});
