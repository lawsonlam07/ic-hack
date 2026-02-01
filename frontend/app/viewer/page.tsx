"use client";

import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  SkipBack,
  SkipForward,
} from "lucide-react";

interface CommentarySegment {
  timestamp: number;
  text: string;
  type: "play" | "analysis" | "excitement";
}

interface AudioSegment {
  timestamp: number;
  text: string;
  audio_url: string;
}

// Parse commentary text from Claude to extract timestamped segments
function parseCommentaryText(text: string): CommentarySegment[] {
  if (!text) return [];

  const segments: CommentarySegment[] = [];

  // Split by lines to preserve timestamp structure
  const lines = text.split("\n").filter((line) => line.trim());

  for (const line of lines) {
    let timestamp = 0;
    let text = line.trim();

    // Try to match "MM:SS - text" or "[MM:SS] text" format
    const mmssMatch = line.match(/^(?:\[)?(\d+):(\d+)(?:\])?[-:\s]+(.+)$/);
    if (mmssMatch) {
      const minutes = parseInt(mmssMatch[1]);
      const seconds = parseInt(mmssMatch[2]);
      timestamp = minutes * 60 + seconds;
      text = mmssMatch[3].trim();
    } else {
      // Try to match "At X seconds - text" or "X seconds - text" format
      const secondsMatch = line.match(
        /^(?:At\s+)?(?:\[)?(\d+(?:\.\d+)?)\s*(?:seconds?|s)(?:\])?[-:\s]+(.+)$/i,
      );
      if (secondsMatch) {
        timestamp = parseFloat(secondsMatch[1]);
        text = secondsMatch[2].trim();
      }
    }

    if (text) {
      // Determine type based on keywords
      const lowerText = text.toLowerCase();
      let type: "play" | "analysis" | "excitement" = "play";

      if (
        lowerText.includes("!") ||
        lowerText.includes("incredible") ||
        lowerText.includes("amazing") ||
        lowerText.includes("wow")
      ) {
        type = "excitement";
      } else if (
        lowerText.includes("notice") ||
        lowerText.includes("technique") ||
        lowerText.includes("strategy")
      ) {
        type = "analysis";
      }

      segments.push({
        timestamp,
        text: text.trim(),
        type,
      });
    }
  }

  return segments;
}

export default function ViewerPage() {
  const searchParams = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const isTogglingRef = useRef(false);
  const lastToggleTimeRef = useRef(0);
  const activeCommentaryRef = useRef<HTMLButtonElement>(null);
  const audioSegmentsRef = useRef<Map<number, HTMLAudioElement>>(new Map());
  const lastPlayedSegmentRef = useRef<number>(-1);

  // State declarations
  const [commentaryResult, setCommentaryResult] = useState<any>(null);
  const [commentarySegments, setCommentarySegments] = useState<CommentarySegment[]>([]);
  const [audioSegments, setAudioSegments] = useState<AudioSegment[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // Get video source from sessionStorage (uploaded video) or URL params or use default
  const videoSource = useMemo(() => {
    const uploadedVideo = sessionStorage.getItem("uploadedVideoUrl");
    console.log("Video source:", uploadedVideo || searchParams.get("video") || "/tennis.mp4");
    return uploadedVideo || searchParams.get("video") || "/tennis.mp4";
  }, [searchParams]);

  // Load commentary result from sessionStorage
  useEffect(() => {
    const audioSegmentsMap = audioSegmentsRef.current;
    const resultStr = sessionStorage.getItem("commentaryResult");
    if (resultStr) {
      const result = JSON.parse(resultStr);
      setCommentaryResult(result);

      // If we have audio segments, use them for display text too
      if (result.audio_segments) {
        setAudioSegments(result.audio_segments);

        // Convert audio segments to commentary segments for display
        // This ensures the text shown matches what's spoken
        const displaySegments: CommentarySegment[] = result.audio_segments.map(
          (seg: AudioSegment) => ({
            timestamp: seg.timestamp,
            text: seg.text,
            type: "play" as const, // Default type, could be enhanced later
          }),
        );
        setCommentarySegments(displaySegments);

        // Preload all audio segments
        result.audio_segments.forEach((segment: AudioSegment, index: number) => {
          const audioUrl = `http://localhost:5000${segment.audio_url}`;
          const audio = new Audio(audioUrl);
          audio.volume = 1.0;
          audio.preload = "auto";

          audioSegmentsMap.set(index, audio);
        });
      } else {
        // Fallback: Parse commentary text into segments if no audio segments     // Parse commentary text into segments with timestamps
        const segments = parseCommentaryText(result.commentary_text);
        setCommentarySegments(segments);
      }
    }

    // Set initial volumes - video at 20%, commentary at 100%
    if (videoRef.current) {
      videoRef.current.volume = 0.2;
    }
    if (audioRef.current) {
      audioRef.current.volume = 1.0;
    }
    // Cleanup on unmount
    return () => {
      audioSegmentsMap.forEach((audio) => {
        audio.pause();
        audio.src = "";
      });
      audioSegmentsMap.clear();
    };
  }, []);

  // Play audio segments at the correct timestamps
  useEffect(() => {
    if (!commentaryResult?.audio_segments || audioSegmentsRef.current.size === 0) {
      // Fallback to single audio file if no segments
      if (commentaryResult?.audio_url && audioRef.current && isPlaying) {
        const syncInterval = setInterval(() => {
          if (videoRef.current && audioRef.current && isPlaying) {
            const videoTime = videoRef.current.currentTime;
            const audioTime = audioRef.current.currentTime;

            const timeDiff = Math.abs(videoTime - audioTime);

            // If audio and video are out of sync by more than 0.3 seconds, resync
            // But only if we're not trying to seek beyond the audio duration
            if (timeDiff > 0.3 && !audioRef.current.ended) {
              audioRef.current.currentTime = videoTime;
            }
          }
        }, 1000); // Check every second

        return () => clearInterval(syncInterval);
      }
      return;
    }

    // New segmented audio playback system
    const checkAndPlaySegments = () => {
      if (!videoRef.current || !isPlaying) return;

      const videoTime = videoRef.current.currentTime;

      // Find which segment should be playing at this time
      commentaryResult.audio_segments.forEach((segment: AudioSegment, index: number) => {
        const audio = audioSegmentsRef.current.get(index);
        if (!audio) return;

        const nextSegment = commentaryResult.audio_segments[index + 1];
        const segmentEnd = nextSegment ? nextSegment.timestamp : Infinity;

        // If we're in this segment's time range
        if (videoTime >= segment.timestamp && videoTime < segmentEnd) {
          // If this segment hasn't been played yet
          if (lastPlayedSegmentRef.current !== index) {
            // Stop all other audio
            audioSegmentsRef.current.forEach((a) => {
              a.pause();
              a.currentTime = 0;
            });

            // Play this segment
            audio.currentTime = 0;
            audio.volume = volume / 100;
            audio.muted = isMuted;
            audio.play().catch((err) => console.error("Failed to play audio segment:", err));

            lastPlayedSegmentRef.current = index;
          }
        }
      });
    };

    const interval = setInterval(checkAndPlaySegments, 100); // Check every 100ms for smoother timing
    return () => clearInterval(interval);
  }, [isPlaying, commentaryResult, currentTime, volume, isMuted]);

  // Find current commentary based on video time
  const currentCommentary = useMemo(() => {
    return (
      commentarySegments
        .filter((seg) => seg.timestamp <= currentTime)
        .sort((a, b) => b.timestamp - a.timestamp)[0] || null
    );
  }, [currentTime, commentarySegments]);

  // Auto-scroll to active commentary
  useEffect(() => {
    if (activeCommentaryRef.current) {
      activeCommentaryRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [currentCommentary]);

  const togglePlay = useCallback(async () => {
    if (!videoRef.current) return;

    // Check if lock is stuck (held for more than 2 seconds)
    const now = Date.now();
    if (isTogglingRef.current) {
      const timeSinceLock = now - lastToggleTimeRef.current;
      if (timeSinceLock > 2000) {
        console.warn("Toggle lock stuck for", timeSinceLock, "ms - forcing unlock");
        isTogglingRef.current = false;
      } else {
        console.warn("Toggle already in progress, skipping");
        return;
      }
    }

    isTogglingRef.current = true;
    lastToggleTimeRef.current = now;

    // Safety timeout to always unlock after 2 seconds
    const timeoutId = setTimeout(() => {
      console.warn("Toggle operation timed out, releasing lock");
      isTogglingRef.current = false;
    }, 2000);

    try {
      if (isPlaying) {
        videoRef.current.pause();
        if (audioRef.current) audioRef.current.pause();
        // Pause all audio segments
        audioSegmentsRef.current.forEach((audio) => audio.pause());
      } else {
        await videoRef.current.play();
        // Don't auto-play audio here - let the sync effect handle it
        // This prevents starting from the wrong position
      }
    } catch (error) {
      console.error("Error toggling playback:", error);
    } finally {
      clearTimeout(timeoutId);
      isTogglingRef.current = false;
    }
  }, [isPlaying]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      // Fallback: set duration if it hasn't been set yet
      if (duration === 0 && videoRef.current.duration) {
        setDuration(videoRef.current.duration);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current && videoRef.current.duration) {
      setDuration(videoRef.current.duration);
      // Set video volume when metadata is loaded
      videoRef.current.volume = 0.2;
    }
  };

  const handleCanPlay = () => {
    if (videoRef.current && videoRef.current.duration && duration === 0) {
      setDuration(videoRef.current.duration);
    }
    // Ensure volumes are set when media can play
    if (videoRef.current) {
      videoRef.current.volume = 0.2;
    }
    if (audioRef.current) {
      audioRef.current.volume = 1.0;
    }
  };

  const handlePlay = () => {
    setIsPlaying(true);
    // Ensure video volume is set when playback starts
    if (videoRef.current) {
      videoRef.current.volume = (volume / 100) * 0.2;
    }
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    console.error("Video error:", e.currentTarget.error);
    if (videoRef.current?.error) {
      console.error("Error code:", videoRef.current.error.code);
      console.error("Error message:", videoRef.current.error.message);
    }
  };

  const handleSeek = async (value: number[]) => {
    if (!videoRef.current) return;

    // Check if lock is stuck (held for more than 2 seconds)
    const now = Date.now();
    if (isTogglingRef.current) {
      const timeSinceLock = now - lastToggleTimeRef.current;
      if (timeSinceLock > 2000) {
        console.warn("Seek lock stuck for", timeSinceLock, "ms - forcing unlock");
        isTogglingRef.current = false;
      } else {
        console.warn("Seek already in progress, skipping");
        return;
      }
    }

    isTogglingRef.current = true;
    lastToggleTimeRef.current = now;

    // Safety timeout to always unlock after 2 seconds
    const timeoutId = setTimeout(() => {
      console.warn("Seek operation timed out, releasing lock");
      isTogglingRef.current = false;
    }, 2000);

    try {
      const newTime = value[0];
      const wasPlaying = isPlaying;

      // Pause both media elements first
      if (wasPlaying) {
        videoRef.current.pause();
        if (audioRef.current) audioRef.current.pause();
        // Stop all audio segments
        audioSegmentsRef.current.forEach((audio) => {
          audio.pause();
          audio.currentTime = 0;
        });
      }

      // Seek to new time
      videoRef.current.currentTime = newTime;
      if (audioRef.current) audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      // Reset last played segment so it can trigger again
      lastPlayedSegmentRef.current = -1;

      // Resume playback if it was playing before
      if (wasPlaying) {
        await videoRef.current.play();
        // Let the sync effect handle audio playback
      }
    } catch (error) {
      console.error("Error during seek:", error);
    } finally {
      clearTimeout(timeoutId);
      isTogglingRef.current = false;
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);

    // Video audio at 20% of slider value, commentary at 100% of slider value
    if (videoRef.current) {
      videoRef.current.volume = (newVolume / 100) * 0.2;
    }
    if (audioRef.current) {
      audioRef.current.volume = newVolume / 100;
    }
    // Update all audio segments
    audioSegmentsRef.current.forEach((audio) => {
      audio.volume = newVolume / 100;
    });

    setIsMuted(newVolume === 0);
  };

  const toggleMute = useCallback(() => {
    const newMutedState = !isMuted;
    if (videoRef.current) {
      videoRef.current.muted = newMutedState;
    }
    if (audioRef.current) {
      audioRef.current.muted = newMutedState;
    }
    setIsMuted(newMutedState);
  }, [isMuted]);

  const toggleFullscreen = useCallback(() => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  }, []);

  const skipTime = useCallback(
    async (seconds: number) => {
      if (!videoRef.current) return;

      // Check if lock is stuck (held for more than 2 seconds)
      const now = Date.now();
      if (isTogglingRef.current) {
        const timeSinceLock = now - lastToggleTimeRef.current;
        if (timeSinceLock > 2000) {
          console.warn("Skip lock stuck for", timeSinceLock, "ms - forcing unlock");
          isTogglingRef.current = false;
        } else {
          console.warn("Skip already in progress, skipping");
          return;
        }
      }

      isTogglingRef.current = true;
      lastToggleTimeRef.current = now;

      // Safety timeout to always unlock after 2 seconds
      const timeoutId = setTimeout(() => {
        console.warn("Skip operation timed out, releasing lock");
        isTogglingRef.current = false;
      }, 2000);

      try {
        const wasPlaying = isPlaying;
        const newTime = videoRef.current.currentTime + seconds;
        const clampedTime = Math.max(0, Math.min(videoRef.current.duration, newTime));

        // Pause if playing
        if (wasPlaying) {
          videoRef.current.pause();
          if (audioRef.current) audioRef.current.pause();

          // Stop all audio segments
          audioSegmentsRef.current.forEach((audio) => {
            audio.pause();
            audio.currentTime = 0;
          });
        }

        // Seek
        videoRef.current.currentTime = clampedTime;
        if (audioRef.current) audioRef.current.currentTime = clampedTime;
        // Reset last played segment
        lastPlayedSegmentRef.current = -1;

        // Resume if was playing
        if (wasPlaying) {
          await videoRef.current.play();
          // Let the sync effect handle audio playback
        }
      } catch (error) {
        console.error("Error during skip:", error);
      } finally {
        clearTimeout(timeoutId);
        isTogglingRef.current = false;
      }
    },
    [isPlaying],
  );

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // YouTube keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "arrowleft":
          e.preventDefault();
          skipTime(-5);
          break;
        case "arrowright":
          e.preventDefault();
          skipTime(5);
          break;
        case "j":
          e.preventDefault();
          skipTime(-10);
          break;
        case "l":
          e.preventDefault();
          skipTime(10);
          break;
        case "arrowup":
          e.preventDefault();
          setVolume((prev) => {
            const newVol = Math.min(100, prev + 5);
            if (videoRef.current) {
              videoRef.current.volume = (newVol / 100) * 0.2;
            }
            if (audioRef.current) {
              audioRef.current.volume = newVol / 100;
            }
            audioSegmentsRef.current.forEach((audio) => {
              audio.volume = newVol / 100
            })
            return newVol;
          });
          setIsMuted(false);
          break;
        case "arrowdown":
          e.preventDefault();
          setVolume((prev) => {
            const newVol = Math.max(0, prev - 5);
            if (videoRef.current) {
              videoRef.current.volume = (newVol / 100) * 0.2;
            }
            if (audioRef.current) {
              audioRef.current.volume = newVol / 100;
            }
            audioSegmentsRef.current.forEach((audio) => {
              audio.volume = newVol / 100
            })
            return newVol;
          });
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "0":
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9":
          e.preventDefault();
          if (videoRef.current && duration) {
            const percentage = parseInt(e.key) * 10;
            handleSeek([(duration * percentage) / 100]);
          }
          break;
        case "home":
          e.preventDefault();
          if (videoRef.current) {
            handleSeek([0]);
          }
          break;
        case "end":
          e.preventDefault();
          if (videoRef.current && duration) {
            handleSeek([duration]);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, volume, duration, togglePlay, skipTime, toggleMute, toggleFullscreen]);

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <Image src="/file.svg" alt="Ball Knowledge Logo" width={50} height={50} />
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100">
              Ball Knowledge
            </h1>
          </Link>
        </div>

        {/* Warning banner if audio is not available */}
        {commentaryResult && !commentaryResult.audio_url && !commentaryResult.audio_segments && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ Audio commentary unavailable. Text commentary is displayed below.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Video Player */}
          <div className="lg:col-span-2">
            <div
              className="relative bg-black rounded-lg overflow-hidden group aspect-video"
              onMouseEnter={() => setShowControls(true)}
              onMouseLeave={() => setShowControls(false)}
            >
              <video
                ref={videoRef}
                className="w-full aspect-video cursor-pointer"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onCanPlay={handleCanPlay}
                onLoadedData={handleLoadedMetadata}
                onPlay={handlePlay}
                onPause={handlePause}
                onError={handleVideoError}
                onClick={togglePlay}
                src={videoSource}
              >
                Your browser does not support the video tag.
              </video>

              {/* Audio Commentary (synced with video) */}
              {commentaryResult?.audio_url && (
                <audio
                  ref={audioRef}
                  src={`http://localhost:5000${commentaryResult.audio_url}`}
                  preload="auto"
                />
              )}

              {/* Video Controls Overlay */}
              <div
                className={`absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 via-black/50 to-transparent p-4 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}
              >
                {/* Progress Bar */}
                <div className="mb-3">
                  <Slider
                    value={[currentTime]}
                    max={duration || 100}
                    step={0.1}
                    onValueChange={handleSeek}
                    className="cursor-pointer"
                  />
                </div>

                {/* Control Buttons */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlay();
                      }}
                    >
                      {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        skipTime(-10);
                      }}
                    >
                      <SkipBack className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        skipTime(10);
                      }}
                    >
                      <SkipForward className="h-4 w-4" />
                    </Button>

                    {/* Volume Control */}
                    <div className="relative flex items-center group/volume">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-white hover:bg-white/20"
                        onMouseEnter={() => setShowVolumeSlider(true)}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMute();
                        }}
                      >
                        {isMuted || volume === 0 ? (
                          <VolumeX className="h-4 w-4" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </Button>
                      {showVolumeSlider && (
                        <div
                          className="absolute left-full ml-2 bg-black/90 rounded-lg px-3 py-2"
                          onMouseEnter={() => setShowVolumeSlider(true)}
                          onMouseLeave={() => setShowVolumeSlider(false)}
                        >
                          <Slider
                            value={[volume]}
                            max={100}
                            step={1}
                            onValueChange={handleVolumeChange}
                            className="w-24"
                          />
                        </div>
                      )}
                    </div>

                    {/* Time Display */}
                    <span className="text-xs text-white ml-2">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFullscreen();
                      }}
                    >
                      <Maximize className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Commentary Timeline */}
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm flex flex-col max-h-120">
            <h2 className="text-sm font-semibold mb-3 text-slate-600 dark:text-slate-400 uppercase tracking-wide shrink-0">
              Commentary
            </h2>
            <div className="space-y-2 overflow-y-auto pr-2">
              {commentarySegments.map((segment, index) => (
                <button
                  key={index}
                  ref={
                    currentCommentary?.timestamp === segment.timestamp ? activeCommentaryRef : null
                  }
                  onClick={() => handleSeek([segment.timestamp])}
                  className={`w-full text-left p-3 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-slate-700 ${
                    currentCommentary?.timestamp === segment.timestamp
                      ? "bg-slate-100 dark:bg-slate-700 border-l-2 border-primary"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {formatTime(segment.timestamp)}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 capitalize">
                      {segment.type}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{segment.text}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
