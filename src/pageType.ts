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
    // Obsidian drawing notes are Markdown files; the special suffix is optional.
    fileExtensions: [".md", ".excalidraw"],
    match: excalidrawMatcher,

    generate({ ctx }) {
      detectedExcalidrawFiles.clear();
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
        } catch (error) {
          console.warn(`[Excalidraw] Could not read candidate file: ${filePath}`, error);
          continue;
        }

        const hasExcalidrawMarker = /^\s*excalidraw-plugin:\s*parsed\s*$/m.test(content);
        const data = parseExcalidraw(content, filePath);
        if (!data) {
          if (hasExcalidrawMarker) {
            console.warn(
              `[Excalidraw] Marked drawing did not parse: ${filePath} (drawing heading: ${content.includes("# Drawing")}, JSON fence: ${content.includes("```json")}, compressed JSON fence: ${content.includes("```compressed-json")})`,
            );
          }
          continue;
        }

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
            if (match) resolvedImagePaths[hash] = match;
          }
        }

        const baseName =
          filePath
            .replace(/\.excalidraw\.md$/i, "")
            .replace(/\.excalidraw$/i, "")
            .replace(/\.md$/i, "")
            .split("/")
            .pop() ?? "Excalidraw Drawing";
        const slug = slugifyFilePath(filePath as Parameters<typeof slugifyFilePath>[0]) as FullSlug;
        console.info(
          `[Excalidraw] Parsed drawing: ${filePath} -> ${slug} (${data.elements.length} elements)`,
        );

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

      console.info(
        `[Excalidraw] Scanned ${excalidrawFiles.length} Markdown/Excalidraw files; created ${virtualPages.length} drawing page(s).`,
      );
      return virtualPages;
    },

    shouldPublish(_ctx: BuildCtx, content: ProcessedContent) {
      const fileData = content[1].data;
      const relativePath = fileData.relativePath ?? "";
      const frontmatter = fileData.frontmatter as Record<string, unknown> | undefined;
      const isExcalidraw =
        detectedExcalidrawFiles.has(relativePath) ||
        frontmatter?.["excalidraw-plugin"] === "parsed" ||
        /\.(excalidraw\.md|excalidraw)$/i.test(relativePath);

      if (isExcalidraw) {
        console.info(`[Excalidraw] Skipping regular Markdown publication: ${relativePath}`);
        return false;
      }
      return true;
    },

    layout: "excalidraw",
    frame: "excalidraw",
    body: ExcalidrawBody,
  };
};
