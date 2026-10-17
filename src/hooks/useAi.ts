import { resolveModel } from '../ai/client';
import { useSettings } from './useSettings';

/** AI is available only with a key AND the toggle on; otherwise every AI control stays hidden. */
export function useAi(): { available: boolean; apiKey: string; model: string } {
  const s = useSettings();
  const apiKey = s.aiApiKey?.trim() ?? '';
  return { available: s.aiEnabled && !!apiKey, apiKey, model: resolveModel(s) };
}
