import type {
  QuartzPageTypePlugin,
  PageMatcher,
  FullSlug,
  VirtualPage,
  ProcessedContent,
  BuildCtx,
} from "@quartz-community/types";
import { slugifyFilePath } from "@quartz-community/utils/path";
import { readFileSync } from "fs";
import { join } from "path";
import { parseExcalidraw } from "./parser";
import ExcalidrawBody from "./components/ExcalidrawBody";
import type { ExcalidrawPageOptions } from "./types";

const excalidrawMatcher: PageMatcher = ({ fileData }) => {
  return "excalidrawData" in fileData;
};

export const ExcalidrawPage: QuartzPageTypePlugin<ExcalidrawPageOptions> = (opts) => {
  const detectedExcalidrawFiles = new Set<string>();

  return {
    name: "ExcalidrawPage",
    priority: 25,
    fileExtensions: [".md", ".excalidraw"],
    match: excalidrawMatcher,

    generate({ ctx }) {
    const excalidrawFiles = ctx.allFiles.filter((fp: string) => /\.(md|excalidraw)$/i.test(fp));

    const imageFiles = ctx.allFiles.filter((fp: string) =>
      /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i.test(fp),
    );

    const virtualPages: VirtualPage[] = [];

    for (const filePath of excalidrawFiles) {
      const fullPath = join(ctx.argv.directory, filePath);
      let content: string;
      try {
        content = readFileSync(fullPath, "utf-8");
      } catch {
        continue;
      }

      const data = parseExcalidraw(content, filePath);
      if (!data) continue;
      detectedExcalidrawFiles.add(filePath);

      const resolvedImagePaths: Record<string, string> = {};
      if (data.embeddedFiles) {
        for (const [hash, wikilink] of Object.entries(data.embeddedFiles)) {
          if (data.files[hash]?.dataURL) continue;
          const targetName = wikilink.split("/").pop()?.toLowerCase() ?? "";
          const match = imageFiles.find((fp: string) => {
            const fpName = fp.split("/").pop()?.toLowerCase() ?? "";
            return fpName === targetName;
          });
          if (match) {
            resolvedImagePaths[hash] = match;
          }
        }
      }

      const baseName =
        filePath
          .replace(/\.excalidraw\.md$/, "")
          .replace(/\.excalidraw$/, "")
          .replace(/\.md$/, "")
          .split("/")
          .pop() ?? "Excalidraw Drawing";
      const slug = slugifyFilePath(filePath as Parameters<typeof slugifyFilePath>[0]) as FullSlug;

      virtualPages.push({
        slug,
        title: baseName,
        data: {
          frontmatter: { title: baseName, tags: ["excalidraw"] },
          excalidrawData: data,
          excalidrawOptions: opts,
          excalidrawImagePaths: resolvedImagePaths,
        },
      });
    }

    return virtualPages;
    },

    shouldPublish(_ctx: BuildCtx, content: ProcessedContent) {
    const relativePath = content[1].data.relativePath ?? "";
    if (detectedExcalidrawFiles.has(relativePath)) return false;
    if (/\.(excalidraw\.md|excalidraw)$/i.test(relativePath)) {
      return false;
    }
    return true;
    },

    layout: "excalidraw",
    frame: "excalidraw",
    body: ExcalidrawBody,
  };
};
