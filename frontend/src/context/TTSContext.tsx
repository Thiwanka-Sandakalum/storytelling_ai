import { createContext, useContext, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTTS } from '../hooks/useTTS';

type TTSContextType = ReturnType<typeof useTTS>;

const TTSContext = createContext<TTSContextType | null>(null);

export const TTSProvider = ({ children }: { children: ReactNode }) => {
    const location = useLocation();

    // Derive storyId directly from the URL.
    // - Navigating TO /studio/:id  → null → id  → useEffect in useTTS fires → WS connects
    // - Navigating AWAY            → id  → null → useEffect cleanup fires  → WS closes
    // - Revisiting same /studio/:id → null → id  → reconnects cleanly every time
    // This avoids the Redux currentId no-change race condition where useTTS
    // never re-inits because the Redux value was already set to the same id.
    const match = location.pathname.match(/^\/studio\/(.+)/);
    const studioId = match ? match[1] : null;

    const tts = useTTS(studioId);

    return <TTSContext.Provider value={tts}>{children}</TTSContext.Provider>;
};

export const useTTSContext = (): TTSContextType => {
    const ctx = useContext(TTSContext);
    if (!ctx) throw new Error('useTTSContext must be used inside TTSProvider');
    return ctx;
};
