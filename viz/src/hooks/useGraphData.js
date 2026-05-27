import { useCallback, useEffect, useRef, useState } from 'react';

const BASE =
  import.meta.env.VITE_GITHUB_RAW_BASE ||
  'https://raw.githubusercontent.com/seanker10/apparatus/main/data';

const REFRESH_MS = 60_000;

export default function useGraphData() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const ts = Date.now();
      const [nRes, eRes] = await Promise.all([
        fetch(`${BASE}/nodes.json?t=${ts}`),
        fetch(`${BASE}/edges.json?t=${ts}`),
      ]);
      if (!nRes.ok || !eRes.ok) {
        throw new Error(`fetch failed (${nRes.status}/${eRes.status})`);
      }
      const [n, e] = await Promise.all([nRes.json(), eRes.json()]);
      setNodes(n);
      setEdges(e);
      setError(null);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    timerRef.current = setInterval(fetchAll, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [fetchAll]);

  return { nodes, edges, loading, error, refetch: fetchAll };
}
