import { useCallback, useEffect, useState } from 'react';
import { Panel, PageHeader } from '../components/ui';
import { CameraDeck } from '../components/Decks';
import { CameraViewer } from '../components/CameraViewer';
import { Gallery } from '../components/Gallery';
import { MovementPanel, FullscreenControls } from '../components/Decks';
import { api } from '../services/api';
import { useRobot } from '../state/RobotContext';
import { useLayout } from '../hooks/useMedia';
import type { Snapshot } from '../types';

export function useRecentSnapshots(limit = 12) {
  const [items, setItems] = useState<Snapshot[]>([]);
  const { eventTick } = useRobot();
  const load = useCallback(() => { api.snapshots({ limit }).then((r) => setItems(r.snapshots)).catch(() => {}); }, [limit]);
  useEffect(load, [load, eventTick]);
  return { items, reload: load };
}

export default function CameraPage() {
  const { items, reload } = useRecentSnapshots(15);
  const { mode } = useLayout();
  return (
    <div className="space-y-3">
      <PageHeader title="Live Camera" sub="ESP32-CAM stream with movement controls kept alongside" />
      {mode === 'mobile' ? (<><CameraViewer fullscreenOverlay={<FullscreenControls />} /><MovementPanel /></>) : <CameraDeck flippers={false} />}
      <Panel title="Inspection gallery — latest"><Gallery items={items} onChange={reload} /></Panel>
    </div>
  );
}
