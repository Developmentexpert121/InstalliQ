import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface LazyImageProps {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  iconSize?: "sm" | "md" | "lg";
  objectFit?: "cover" | "contain";
  priority?: boolean;
}

export function LazyImage({
  src,
  alt = "Image",
  className,
  fallbackClassName,
  iconSize = "md",
  objectFit = "cover",
  priority = false,
}: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const iconSizeClass = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  }[iconSize];

  if (!src || error) {
    return (
      <div className={cn("flex items-center justify-center bg-muted", fallbackClassName ?? className)}>
        <ImageIcon className={cn(iconSizeClass, "text-muted-foreground/40")} />
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Skeleton shimmer shown until image loads */}
      {!loaded && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
      <img
        src={src}
        alt={alt}
        loading="eager"
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={cn(
          "w-full h-full transition-opacity duration-300",
          objectFit === "cover" ? "object-cover" : "object-contain",
          loaded ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}
