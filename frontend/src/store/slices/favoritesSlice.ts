import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface FavoritesState {
    ids: string[];
}

const initialState: FavoritesState = { ids: [] };

export const favoritesSlice = createSlice({
    name: 'favorites',
    initialState,
    reducers: {
        toggleFavorite: (state, action: PayloadAction<string>) => {
            const idx = state.ids.indexOf(action.payload);
            if (idx === -1) state.ids.push(action.payload);
            else state.ids.splice(idx, 1);
        },
    },
});

export const { toggleFavorite } = favoritesSlice.actions;
export default favoritesSlice.reducer;
