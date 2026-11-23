import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

export function useScreenData(loader, deps = []) {
  const [state, setState] = useState({ loading: true, refreshing: false, error: null, data: null });
  const requestId = useRef(0);

  const load = useCallback(async (mode = 'load') => {
    const id = requestId.current + 1;
    requestId.current = id;
    setState((current) => ({
      ...current,
      loading: mode !== 'refresh' && !current.data,
      refreshing: mode === 'refresh',
      error: null,
    }));
    try {
      const data = await loader();
      if (id !== requestId.current) return;
      setState({ loading: false, refreshing: false, error: null, data });
    } catch (error) {
      if (id !== requestId.current) return;
      setState((current) => ({
        loading: false,
        refreshing: false,
        error,
        data: current.data,
      }));
    }
  }, deps);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { ...state, reload: () => load('refresh') };
}
