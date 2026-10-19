import { Clapperboard, Film, Image, ImagePlus, ScanFace, Video, type LucideIcon } from "lucide-react";
import type { TaskKey } from "../api/types";

export interface TaskMeta {
  key: TaskKey;
  title: string;
  desc: string;
  tag: string;
  icon: LucideIcon;
  needsImage: boolean;
  needsVideo: boolean;
  needsFace: boolean;
  presets: string[];
}

export const TASKS: TaskMeta[] = [
  {
    key: "text_to_video",
    title: "Text to Video",
    desc: "Cinematic 9:16 Reels from a prompt",
    tag: "LTX-Video",
    icon: Video,
    needsImage: false,
    needsVideo: false,
    needsFace: false,
    presets: [
      "A stylish girl walking in a rainy neon cyberpunk city, cinematic slow motion, reflections",
      "Golden hour aerial drone shot of Mediterranean coastline with turquoise waves and yachts",
      "Futuristic sports car accelerating through a desert canyon at dusk, dust trail, 4k",
      "Close up of coffee pouring into an artisan glass cup, morning sunbeams, cozy aesthetic",
    ],
  },
  {
    key: "image_to_video",
    title: "Image to Video",
    desc: "Animate a still photo into motion",
    tag: "Motion Diffusion",
    icon: Clapperboard,
    needsImage: true,
    needsVideo: false,
    needsFace: false,
    presets: [
      "Slow elegant zoom in, gentle breeze moving hair, warm golden sunlight shimmering",
      "Camera slowly orbits subject with dramatic bokeh and soft atmospheric haze",
      "Subtle cinematic parallax motion, water ripples in the background, cinematic 60fps",
    ],
  },
  {
    key: "text_to_image",
    title: "Text to Image",
    desc: "Photorealistic ultra-HD photos",
    tag: "FLUX.1 Schnell",
    icon: Image,
    needsImage: false,
    needsVideo: false,
    needsFace: false,
    presets: [
      "Ultra-realistic portrait of a fashion model in haute couture streetwear, studio neon rim light",
      "Cozy minimalist Nordic coffee shop on a snowy evening, warm amber lamps, photorealistic",
      "Macro close-up of a holographic iridescent butterfly on a dew-covered flower, octane render",
    ],
  },
  {
    key: "face_swap",
    title: "Face Swap",
    desc: "Seamless reference identity transfer",
    tag: "BFS Best Swap",
    icon: ScanFace,
    needsImage: true,
    needsVideo: false,
    needsFace: true,
    presets: [
      "Glamorous Hollywood red carpet evening gown photoshoot, flash photography, elegance",
      "Vintage 1990s aesthetic candid polaroid, warm grainy film look, urban city rooftop",
    ],
  },
  {
    key: "video_to_video",
    title: "Video to Video",
    desc: "Restyle a clip with a new aesthetic",
    tag: "Video Stylizer",
    icon: Film,
    needsImage: false,
    needsVideo: true,
    needsFace: false,
    presets: [
      "Restyle into vibrant retro anime 80s aesthetic with glowing outlines and cel shading",
      "Transform into dramatic noir black and white high contrast film look",
    ],
  },
  {
    key: "image_to_image",
    title: "Image to Image",
    desc: "Re-imagine and edit scene styling",
    tag: "Image Edit",
    icon: ImagePlus,
    needsImage: true,
    needsVideo: false,
    needsFace: false,
    presets: [
      "Transform daytime lighting to dramatic dusk golden hour with glowing city lights",
      "Enhance into modern editorial magazine cover style, high fashion colors",
    ],
  },
];

export const TASK_BY_KEY = Object.fromEntries(TASKS.map((t) => [t.key, t])) as Record<TaskKey, TaskMeta>;

export const TONES = [
  { label: "Emotional", value: "emotional, loving, attractive, human, with emojis" },
  { label: "Viral", value: "viral, hype, catchy, engaging, witty" },
  { label: "Aesthetic", value: "aesthetic, poetic, minimalist, serene" },
  { label: "Story", value: "storytelling, inspiring" },
  { label: "Growth", value: "business, growth, high energy" },
];
