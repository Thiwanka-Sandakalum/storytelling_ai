import { configureStore } from '@reduxjs/toolkit';
import storyReducer from './slices/storySlice';
import favoritesReducer from './slices/favoritesSlice';

export const store = configureStore({
     reducer: {
          story: storyReducer,
          favorites: favoritesReducer,
     },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
