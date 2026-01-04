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
  const errorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('Este navegador no permite usar la cámara');
          return;
        }

        // Solicitar permisos con la cámara trasera ideal
        const permissionStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
        permissionStream.getTracks().forEach((track) => track.stop());

        const constraints = {
          video: {
            facingMode: { ideal: 'environment' as const },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };

        controlsRef.current = await reader.decodeFromConstraints(
          constraints,
          videoRef.current!,
          (result, err) => {
            if (result) {
              onDetected(result.getText());
            }
            if (err) {
              if (err.name === 'NotFoundException') {
                if (!errorTimeout.current) {
                  setError('No encontramos el código, acercalo un poco más…');
                  errorTimeout.current = setTimeout(() => {
                    setError('');
                    errorTimeout.current = null;
                  }, 2000);
                }
                return;
              }
              setError(err.message);
            }
          },
        );
      } catch (err) {
        const message =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'No tenemos permiso para usar la cámara. Permitilo y volvé a intentarlo.'
            : err instanceof Error
              ? err.message
              : 'No se pudo iniciar la cámara';
        setError(message);
      }
    };

    start();

    return () => {
      controlsRef.current?.stop();
      if (errorTimeout.current) {
        clearTimeout(errorTimeout.current);
      }
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
