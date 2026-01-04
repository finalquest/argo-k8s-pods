import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';

type BarcodeScannerProps = {
  onDetected: (value: string) => void;
  onClose: () => void;
};

export function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    const start = async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const deviceId = devices[0]?.deviceId;
        if (!deviceId) {
          setError('No se encontró cámara usable');
          return;
        }

        controlsRef.current = await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current!,
          (result, err) => {
            if (result) {
              onDetected(result.getText());
            }
            if (err && err.name !== 'NotFoundException') {
              setError(err.message);
            }
          },
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo iniciar la cámara');
      }
    };

    start();

    return () => {
      controlsRef.current?.stop();
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Escanear código</h3>
          <button
            type="button"
            className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <video ref={videoRef} className="aspect-video w-full bg-black" autoPlay muted />
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <p className="mt-2 text-xs text-slate-500">
          Apuntá la cámara al código de barras y se completará automáticamente.
        </p>
      </div>
    </div>
  );
}
