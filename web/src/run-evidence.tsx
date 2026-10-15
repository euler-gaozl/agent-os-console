import React from "react";
import { FileText } from "lucide-react";
import {
  hasArchiveManifest,
  isSourceEngine,
  WorkingStatePanel,
} from "./working-state";

export function RunArchiveButton({
  id,
  engine,
  artifact,
  download,
}: {
  id: string;
  engine: string;
  artifact?: string;
  download: (artifact: string, filename: string) => void;
}) {
  if (!artifact) return null;
  const manifest = hasArchiveManifest(engine);
  return (
    <button
      className="button"
      onClick={() =>
        download(artifact, `dsh-${manifest ? "manifest-" : ""}${id}.json`)
      }
    >
      <FileText size={15} />
      {manifest ? "下载执行记录清单" : "下载完整 DSH 执行记录"}
    </button>
  );
}

export function RunEvidenceDetails({
  id,
  engine,
  status,
  refreshRun,
}: {
  id: string;
  engine: string;
  status: string;
  refreshRun: () => Promise<void>;
}) {
  return (
    <>
      {hasArchiveManifest(engine) && (
        <p className="muted">
          执行记录按批次保存。下载清单包含当前批次的文件索引、校验值及前序清单入口。
        </p>
      )}
      {isSourceEngine(engine) && (
        <WorkingStatePanel
          id={id}
          status={status}
          refreshRun={refreshRun}
        />
      )}
    </>
  );
}
