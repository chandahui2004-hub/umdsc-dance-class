import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import { NeonSign } from './NeonSign';
import { PixelPortraitFrame } from './PixelPortraitFrame';
import { getYouTubeVideoId } from '../../features/music-studio/dancecue/utils/youtube';

describe('NeonSign & PixelPortraitFrame', () => {
  it('NeonSign renders text with custom --glow while preserving var(--text-1) text colour', () => {
    render(<NeonSign text="Hip Hop" color="#123456" />);
    const sign = screen.getByTestId('neon-sign');
    expect(sign).toBeInTheDocument();
    expect(sign).toHaveTextContent('HIP HOP');
    expect(sign.style.getPropertyValue('--glow')).toBe('#123456');
    expect(sign.style.color).toBe('var(--text-1)');
  });

  it('PixelPortraitFrame renders photo, name, and glow property', () => {
    render(
      <PixelPortraitFrame
        src="/photo.jpg"
        alt="Carmen Loh"
        name="Carmen Loh"
        glow="#3EE6FF"
        size="sm"
      />
    );
    expect(screen.getByAltText('Carmen Loh')).toBeInTheDocument();
    expect(screen.getByText('Carmen Loh')).toBeInTheDocument();
    const frame = screen.getByTestId('pixel-portrait-frame');
    expect(frame.style.getPropertyValue('--glow')).toBe('#3EE6FF');
    expect(frame.className).toContain('w-[120px]');
  });

  it('PixelPortraitFrame with showNamePlate=false does not render name plate and locks frame width', () => {
    render(
      <PixelPortraitFrame
        src="/photo.jpg"
        alt="Newstyle Kelvin"
        name="Newstyle Kelvin"
        glow="#FF7A00"
        size="md"
        showNamePlate={false}
      />
    );
    expect(screen.getByAltText('Newstyle Kelvin')).toBeInTheDocument();
    expect(screen.queryByText('Newstyle Kelvin')).not.toBeInTheDocument();
    const frame = screen.getByTestId('pixel-portrait-frame');
    expect(frame.className).toContain('w-[160px]');
    expect(frame.className).toContain('shrink-0');
  });

  it('pixel.css includes color-scheme and neon indicator filter for time and date inputs', async () => {
    const cssPath = path.resolve(__dirname, '../../theme/pixel.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    expect(css).toContain('input[type="time"]');
    expect(css).toContain('color-scheme: dark');
    expect(css).toContain('::-webkit-calendar-picker-indicator');
  });

  it('getYouTubeVideoId extracts video ID from schemeless URL', () => {
    expect(getYouTubeVideoId('youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('has zero sub-10px typography classes across web/src/**/*.{ts,tsx}', () => {
    const srcDir = path.resolve(__dirname, '..', '..');
    const sub10pxPattern = /text-\[[1-9]px\]/;

    function getFiles(dir: string): string[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...getFiles(fullPath));
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const files = getFiles(srcDir);
    const violations: { file: string; line: number; match: string }[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (sub10pxPattern.test(line)) {
          violations.push({
            file: path.relative(srcDir, file).replace(/\\/g, '/'),
            line: index + 1,
            match: line.trim()
          });
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
