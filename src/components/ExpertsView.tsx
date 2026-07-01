// src/components/ExpertsView.tsx — Ministry of Experts (MoA panel)
import { useState, useEffect } from 'react';
import { api } from '../api';

export function ExpertsView() {
  const [moa, setMoa] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getConfig().then(data => {
      setMoa(data?.moa);
      setLoading(false);
    }).catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="loading-spinner-container"><div className="loading-spinner" /><p>Loading...</p></div>;

  const presets = moa?.presets || {};
  const presetNames = Object.keys(presets);
  const activePreset = moa?.active_preset || moa?.default_preset || 'default';

  return (
    <div className="experts-view">
      <div className="experts-header">
        <h2>🏛️ Ministry of Experts</h2>
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      <div className="experts-active">
        <h3>Active Preset: <span className="badge badge-purple">{activePreset}</span></h3>
      </div>

      <div className="experts-presets">
        {presetNames.map(name => {
          const preset = presets[name];
          const isActive = name === activePreset;
          return (
            <div key={name} className={`expert-card ${isActive ? 'active' : ''}`}>
              <div className="expert-card-header">
                <span className="expert-name">{name}</span>
                {isActive && <span className="badge badge-green">Active</span>}
              </div>
              <div className="expert-models">
                <div className="expert-section-label">Reference Models:</div>
                {preset?.reference_models?.map((m: any, i: number) => (
                  <div key={i} className="expert-model-row">
                    <span className="expert-provider">{m.provider}</span>
                    <span className="badge badge-teal">{m.model}</span>
                  </div>
                ))}
              </div>
              <div className="expert-models">
                <div className="expert-section-label">Aggregator:</div>
                <div className="expert-model-row">
                  <span className="expert-provider">{preset?.aggregator?.provider}</span>
                  <span className="badge badge-blue">{preset?.aggregator?.model}</span>
                </div>
              </div>
              <div className="expert-temps">
                <span>Ref temp: {preset?.reference_temperature ?? '—'}</span>
                <span>Agg temp: {preset?.aggregator_temperature ?? '—'}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="experts-info">
        <h3>How MoA Works</h3>
        <p>Mixture-of-Agents sends your prompt to multiple reference models in parallel,
          then an aggregator model synthesizes their responses into a single, higher-quality answer.</p>
        <p>Toggle MoA in chat by switching toolsets. The active preset determines which models are consulted.</p>
      </div>
    </div>
  );
}