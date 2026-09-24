import { useState, useRef, useEffect, useCallback } from "react";
import * as faceapi from "face-api.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Camera,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ScanFace,
  Shield,
} from "lucide-react";

interface FaceCaptureProps {
  mode: "register" | "verify";
  onDescriptorCaptured: (descriptor: Float32Array, photo?: string) => void;
  onCancel?: () => void;
  isProcessing?: boolean;
  verifyFailed?: boolean;
  onRetry?: () => void;
}

let modelsLoadPromise: Promise<void> | null = null;

// Reused across every scan frame. A smaller inputSize (default is 416) makes
// detection dramatically faster while staying accurate for close-up login faces.
const FACE_DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
  inputSize: 224,
  scoreThreshold: 0.5,
});

export function preloadFaceModels() {
  if (!modelsLoadPromise) {
    modelsLoadPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
      faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
      faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
    ]).then(async () => {
      // Warm up the detector on a blank frame so the first real scan doesn't
      // pay the one-time cold-start (tensor allocation / shader compile) cost.
      try {
        const warmup = document.createElement("canvas");
        warmup.width = 224;
        warmup.height = 224;
        await faceapi.detectSingleFace(warmup, FACE_DETECTOR_OPTIONS);
      } catch {
        /* warm-up is best-effort */
      }
    });
  }
  return modelsLoadPromise;
}

async function loadModels() {
  return preloadFaceModels();
}

function AnimatedEye() {
  return (
    <div className="relative w-[90px] h-[90px] face-real-eye-container">
      <div className="w-full h-full rounded-full overflow-hidden face-real-eye-img-wrap shadow-lg">
        <img
          src="/eye-scan.png"
          alt=""
          className="w-full h-full object-cover face-real-eye-img"
          draggable={false}
        />
      </div>

      <div className="absolute inset-0 rounded-full face-real-eye-blink-lid" />

      <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
        <div className="face-real-eye-scanbeam" />
      </div>

      <div className="absolute inset-0 rounded-full face-real-eye-glow pointer-events-none" />
    </div>
  );
}

function ScanningAnimation({ state }: { state: "scanning" | "success" | "error" | "processing" }) {
  const iconColor = state === "success" ? "text-green-500" : state === "error" ? "text-destructive" : "text-primary";

  return (
    <div className="relative flex items-center justify-center w-[150px] h-[150px]">
      {(state === "scanning" || state === "processing") && (
        <>
          <div className="absolute inset-[-4px] rounded-full border border-primary/8 face-radar-ring" style={{ animationDelay: "0s" }} />
          <div className="absolute inset-[-14px] rounded-full border border-primary/5 face-radar-ring" style={{ animationDelay: "0.8s" }} />
        </>
      )}

      {state === "success" && (
        <div className="absolute inset-[-4px] rounded-full face-success-burst" />
      )}

      <div className="relative flex items-center justify-center w-[130px] h-[130px] rounded-full bg-gradient-to-br from-muted/50 to-muted/20 face-icon-container">
        {state === "scanning" && (
          <div className="absolute inset-0 rounded-full face-outer-ring" />
        )}
        {state === "processing" && (
          <div className="absolute inset-0 rounded-full face-processing-ring border-[2px]" />
        )}
        {state === "success" && (
          <div className="absolute inset-0 rounded-full border-2 border-green-500/50" />
        )}
        {state === "error" && (
          <div className="absolute inset-0 rounded-full border-2 border-destructive/50" />
        )}

        {state === "scanning" && <AnimatedEye />}
        {state === "processing" && (
          <AnimatedEye />
        )}
        {state === "success" && (
          <CheckCircle2 className={`h-14 w-14 ${iconColor} face-success-icon`} />
        )}
        {state === "error" && (
          <XCircle className={`h-14 w-14 ${iconColor} face-error-icon`} />
        )}
      </div>

      {(state === "scanning" || state === "processing") && (
        <div className="absolute inset-0">
          <div className="absolute top-[2px] left-1/2 -translate-x-1/2 face-corner-pulse">
            <div className="w-[2px] h-3 rounded-full bg-primary/50" />
          </div>
          <div className="absolute bottom-[2px] left-1/2 -translate-x-1/2 face-corner-pulse" style={{ animationDelay: "0.5s" }}>
            <div className="w-[2px] h-3 rounded-full bg-primary/50" />
          </div>
          <div className="absolute left-[2px] top-1/2 -translate-y-1/2 face-corner-pulse" style={{ animationDelay: "0.25s" }}>
            <div className="h-[2px] w-3 rounded-full bg-primary/50" />
          </div>
          <div className="absolute right-[2px] top-1/2 -translate-y-1/2 face-corner-pulse" style={{ animationDelay: "0.75s" }}>
            <div className="h-[2px] w-3 rounded-full bg-primary/50" />
          </div>
        </div>
      )}
    </div>
  );
}

function StatusText({ title, subtitle, variant = "default" }: { title: string; subtitle: string; variant?: "default" | "success" | "error" }) {
  const titleColor = variant === "success" ? "text-green-600 dark:text-green-400" : variant === "error" ? "text-destructive" : "text-foreground";
  return (
    <div className="text-center space-y-0.5 face-text-enter">
      <p className={`text-base font-semibold tracking-tight ${titleColor}`}>{title}</p>
      <p className="text-[13px] text-muted-foreground leading-relaxed">{subtitle}</p>
    </div>
  );
}

function ProgressDots() {
  return (
    <div className="flex items-center justify-center gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full bg-primary/50 face-progress-dot"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  );
}

export default function FaceCapture({
  mode,
  onDescriptorCaptured,
  onCancel,
  isProcessing,
  verifyFailed,
  onRetry,
}: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "detecting" | "captured" | "error"
  >("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const animFrameRef = useRef<number>(0);
  const scanningRef = useRef(false);
  const capturedRef = useRef(false);

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const captureSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas && videoRef.current) {
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        setCapturedImage(canvas.toDataURL("image/jpeg", 0.8));
      }
    }
  }, []);

  const startAutoScan = useCallback(() => {
    if (scanningRef.current || capturedRef.current) return;
    scanningRef.current = true;
    setStatus("detecting");

    async function scan() {
      if (!scanningRef.current || capturedRef.current || !videoRef.current)
        return;

      try {
        const detection = await faceapi
          .detectSingleFace(videoRef.current, FACE_DETECTOR_OPTIONS)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection && scanningRef.current && !capturedRef.current) {
          capturedRef.current = true;
          scanningRef.current = false;
          let photoData: string | undefined;
          if (mode === "register") {
            captureSnapshot();
            const canvas = canvasRef.current;
            if (canvas) {
              photoData = canvas.toDataURL("image/jpeg", 0.8);
            }
          }
          stopCamera();
          setStatus("captured");
          onDescriptorCaptured(detection.descriptor, photoData);
          return;
        }
      } catch (err) {
        console.error("Face scan error:", err);
      }

      if (scanningRef.current && !capturedRef.current) {
        animFrameRef.current = requestAnimationFrame(() => {
          setTimeout(scan, 40);
        });
      }
    }

    scan();
  }, [onDescriptorCaptured, stopCamera, captureSnapshot, mode]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const [, stream] = await Promise.all([
          loadModels(),
          navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "user",
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
          }),
        ]);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus("ready");
      } catch (err: any) {
        if (!cancelled) {
          setStatus("error");
          if (err.name === "NotAllowedError") {
            setErrorMsg(
              "Camera access was denied. Please allow camera access and try again.",
            );
          } else {
            setErrorMsg(
              "Could not access camera. Make sure your device has a camera.",
            );
          }
        }
      }
    }

    init();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (mode === "verify" && status === "ready" && !capturedRef.current) {
      startAutoScan();
    }
  }, [mode, status, startAutoScan]);

  const detectAndCapture = useCallback(async () => {
    if (!videoRef.current || status !== "ready") return;
    setStatus("detecting");

    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, FACE_DETECTOR_OPTIONS)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setStatus("ready");
        setErrorMsg(
          "No face detected. Please make sure your face is clearly visible and try again.",
        );
        return;
      }

      captureSnapshot();
      const canvas = canvasRef.current;
      const photoData = canvas
        ? canvas.toDataURL("image/jpeg", 0.8)
        : undefined;
      stopCamera();
      setStatus("captured");
      onDescriptorCaptured(detection.descriptor, photoData);
    } catch (err) {
      console.error("Face detection error:", err);
      setStatus("ready");
      setErrorMsg("Face detection failed. Please try again.");
    }
  }, [status, onDescriptorCaptured, stopCamera, captureSnapshot]);

  const retry = useCallback(async () => {
    setCapturedImage(null);
    setErrorMsg("");
    capturedRef.current = false;
    scanningRef.current = false;
    setStatus("loading");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("ready");
    } catch {
      setStatus("error");
      setErrorMsg("Could not restart camera.");
    }
  }, []);

  if (mode === "verify") {
    return (
      <div className="flex flex-col items-center gap-6 py-6 face-container-enter">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="sr-only"
          aria-hidden="true"
          data-testid="video-face-capture"
        />
        <canvas ref={canvasRef} className="hidden" />

        {(status === "loading" ||
          status === "ready" ||
          status === "detecting") &&
          !isProcessing && (
            <>
              <ScanningAnimation state="scanning" />
              <div className="flex flex-col items-center gap-3">
                <StatusText
                  title={status === "loading" ? "Preparing..." : "Scanning your face..."}
                  subtitle="Please look at your device"
                />
                <ProgressDots />
              </div>
            </>
          )}

        {status === "captured" && !isProcessing && !verifyFailed && (
          <>
            <ScanningAnimation state="success" />
            <StatusText title="Face recognized" subtitle="Logging you in..." variant="success" />
          </>
        )}

        {verifyFailed && (
          <>
            <ScanningAnimation state="error" />
            <div className="flex flex-col items-center gap-3">
              <StatusText title="Face not recognized" subtitle="Your face didn't match our records" variant="error" />
              {onRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetry}
                  className="hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 face-btn-enter rounded-full px-5"
                  data-testid="button-retry-face"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Try Again
                </Button>
              )}
            </div>
          </>
        )}

        {isProcessing && (
          <>
            <ScanningAnimation state="processing" />
            <div className="flex flex-col items-center gap-3">
              <StatusText title="Verifying identity..." subtitle="Matching your face data" />
              <ProgressDots />
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <ScanningAnimation state="error" />
            <div className="flex flex-col items-center gap-3">
              <StatusText title="Camera error" subtitle={errorMsg} variant="error" />
              <Button
                variant="outline"
                size="sm"
                onClick={retry}
                className="hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 face-btn-enter rounded-full px-5"
                data-testid="button-retry-face"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Try again
              </Button>
            </div>
          </>
        )}

        {onCancel && !isProcessing && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground transition-colors face-btn-enter font-medium"
            onClick={() => {
              stopCamera();
              onCancel();
            }}
            data-testid="button-cancel-face"
          >
            Cancel
          </Button>
        )}

        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 face-text-enter" style={{ animationDelay: "0.5s" }}>
          <Shield className="h-3 w-3" />
          <span>Your face data is encrypted and never stored externally</span>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="relative w-full max-w-md mx-auto aspect-[4/3] bg-muted rounded-md overflow-hidden">
          {status !== "captured" && (
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              autoPlay
              playsInline
              muted
              style={{ transform: "scaleX(-1)" }}
              data-testid="video-face-capture"
            />
          )}
          {capturedImage && status === "captured" && (
            <img
              src={capturedImage}
              alt="Captured face"
              className="w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
              data-testid="img-captured-face"
            />
          )}
          <canvas ref={canvasRef} className="hidden" />

          {status === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-2 text-sm text-muted-foreground">
                Loading camera...
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 p-4">
              <XCircle className="h-8 w-8 text-destructive" />
              <p className="mt-2 text-sm text-center text-muted-foreground">
                {errorMsg}
              </p>
            </div>
          )}

          {status === "detecting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/40">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-2 text-sm text-foreground font-medium">
                Detecting face...
              </p>
            </div>
          )}

          {status === "captured" && !isProcessing && (
            <div className="absolute top-2 right-2">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          )}
        </div>

        {errorMsg && status === "ready" && (
          <p
            className="text-sm text-destructive text-center"
            data-testid="text-face-error"
          >
            {errorMsg}
          </p>
        )}

        <div className="flex items-center justify-center gap-2 flex-wrap">
          {status === "ready" && (
            <Button
              onClick={detectAndCapture}
              data-testid="button-capture-face"
            >
              <Camera className="h-4 w-4 mr-2" />
              Capture Face
            </Button>
          )}

          {status === "captured" && !isProcessing && (
            <Button
              variant="outline"
              onClick={retry}
              data-testid="button-retry-face"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retake
            </Button>
          )}

          {isProcessing && (
            <Button disabled>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </Button>
          )}

          {onCancel && (
            <Button
              variant="ghost"
              onClick={() => {
                stopCamera();
                onCancel();
              }}
              data-testid="button-cancel-face"
            >
              Cancel
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Position your face in the center and click capture. This will be used
          for future logins.
        </p>
      </CardContent>
    </Card>
  );
}
