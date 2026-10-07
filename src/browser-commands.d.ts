type Point = { x: number; y: number };

declare module "vitest/browser" {
  interface BrowserCommands {
    drag(from: Point, to: Point, alt: boolean): Promise<void>;
    doubleClick(at: Point, alt: boolean): Promise<void>;
    hover(at: Point): Promise<void>;
    key(name: string, down: boolean): Promise<void>;
  }
}

export {};
