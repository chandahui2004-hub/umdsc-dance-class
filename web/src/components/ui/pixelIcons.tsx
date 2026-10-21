import React from 'react';

export interface PixelIconProps {
  className?: string;
  size?: number | string;
  color?: string;
}

/** 8-bit Pixel Calendar with binding pins and calendar matrix */
export const PixelCalendarIcon: React.FC<PixelIconProps> = ({ className = 'w-5 h-5', size, color }) => (
  <svg
    viewBox="0 0 20 20"
    fill={color || 'currentColor'}
    shapeRendering="crispEdges"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-hidden="true"
  >
    {/* Binder Pins */}
    <rect x="5" y="1" width="2" height="3" />
    <rect x="13" y="1" width="2" height="3" />
    {/* Calendar Top Border */}
    <rect x="3" y="3" width="14" height="2" />
    {/* Calendar Header Bar */}
    <rect x="3" y="5" width="14" height="3" />
    {/* Calendar Body Sides & Bottom */}
    <rect x="3" y="8" width="2" height="10" />
    <rect x="15" y="8" width="2" height="10" />
    <rect x="5" y="16" width="10" height="2" />
    {/* Date Matrix Pixels */}
    <rect x="6" y="9" width="2" height="2" />
    <rect x="9" y="9" width="2" height="2" />
    <rect x="12" y="9" width="2" height="2" />
    <rect x="6" y="12" width="2" height="2" />
    <rect x="9" y="12" width="2" height="2" />
    <rect x="12" y="12" width="2" height="2" />
  </svg>
);

/** 8-bit Pixel Clipboard with large checkmark */
export const PixelAttendanceIcon: React.FC<PixelIconProps> = ({ className = 'w-5 h-5', size, color }) => (
  <svg
    viewBox="0 0 20 20"
    fill={color || 'currentColor'}
    shapeRendering="crispEdges"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-hidden="true"
  >
    {/* Top Clip */}
    <rect x="7" y="1" width="6" height="3" />
    <rect x="8" y="2" width="4" height="1" fill="var(--night-2, #0d0f18)" />
    {/* Board Outline */}
    <rect x="4" y="3" width="12" height="2" />
    <rect x="3" y="4" width="2" height="14" />
    <rect x="15" y="4" width="2" height="14" />
    <rect x="4" y="16" width="12" height="2" />
    {/* 8-bit Checkmark */}
    <rect x="6" y="10" width="2" height="2" />
    <rect x="8" y="12" width="2" height="2" />
    <rect x="10" y="10" width="2" height="2" />
    <rect x="12" y="8" width="2" height="2" />
    <rect x="14" y="6" width="2" height="2" />
  </svg>
);

/** 8-bit Pixel Beamed Eighth Notes */
export const PixelMusicIcon: React.FC<PixelIconProps> = ({ className = 'w-5 h-5', size, color }) => (
  <svg
    viewBox="0 0 20 20"
    fill={color || 'currentColor'}
    shapeRendering="crispEdges"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-hidden="true"
  >
    {/* Connecting Top Beam */}
    <rect x="6" y="3" width="10" height="3" />
    <rect x="6" y="6" width="2" height="2" />
    {/* Left Stem */}
    <rect x="6" y="6" width="2" height="8" />
    {/* Right Stem */}
    <rect x="14" y="6" width="2" height="7" />
    {/* Left Note Head */}
    <rect x="3" y="12" width="5" height="4" />
    {/* Right Note Head */}
    <rect x="11" y="11" width="5" height="4" />
  </svg>
);

/** 8-bit Pixel B-Boy / Dancer Silhouette */
export const PixelUserIcon: React.FC<PixelIconProps> = ({ className = 'w-5 h-5', size, color }) => (
  <svg
    viewBox="0 0 20 20"
    fill={color || 'currentColor'}
    shapeRendering="crispEdges"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-hidden="true"
  >
    {/* Snapback Cap & Brim */}
    <rect x="7" y="1" width="5" height="2" />
    <rect x="12" y="2" width="2" height="1" />
    {/* Head / Face */}
    <rect x="8" y="3" width="4" height="3" />
    {/* Torso / Hoodie */}
    <rect x="7" y="6" width="6" height="5" />
    {/* Left Wave Arm */}
    <rect x="5" y="6" width="2" height="2" />
    <rect x="4" y="4" width="2" height="3" />
    <rect x="3" y="3" width="2" height="2" />
    {/* Right Freeze Arm */}
    <rect x="13" y="7" width="2" height="2" />
    <rect x="15" y="8" width="2" height="3" />
    <rect x="16" y="10" width="2" height="2" />
    {/* Left Leg */}
    <rect x="6" y="11" width="3" height="4" />
    {/* Right Bent Leg */}
    <rect x="11" y="11" width="3" height="3" />
    <rect x="13" y="13" width="3" height="3" />
    {/* High-Top Sneakers */}
    <rect x="4" y="15" width="5" height="2" />
    <rect x="13" y="16" width="5" height="2" />
  </svg>
);

/** 8-bit Pixel Retro VHS Video Camera / Reel */
export const PixelVideoIcon: React.FC<PixelIconProps> = ({ className = 'w-5 h-5', size, color }) => (
  <svg
    viewBox="0 0 20 20"
    fill={color || 'currentColor'}
    shapeRendering="crispEdges"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-hidden="true"
  >
    {/* Top Handle / Tape Housing */}
    <rect x="5" y="3" width="7" height="2" />
    {/* Main Camera Body */}
    <rect x="3" y="5" width="10" height="9" />
    {/* Cassette View Window */}
    <rect x="5" y="7" width="2" height="2" fill="var(--night-2, #0d0f18)" />
    <rect x="9" y="7" width="2" height="2" fill="var(--night-2, #0d0f18)" />
    {/* Lens Barrel */}
    <rect x="13" y="7" width="2" height="5" />
    <rect x="15" y="6" width="2" height="7" />
    {/* Base Stand */}
    <rect x="5" y="14" width="6" height="2" />
  </svg>
);

/** 8-bit Pixel Arcade Triple Dot / More */
export const PixelMoreIcon: React.FC<PixelIconProps> = ({ className = 'w-5 h-5', size, color }) => (
  <svg
    viewBox="0 0 20 20"
    fill={color || 'currentColor'}
    shapeRendering="crispEdges"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-hidden="true"
  >
    <rect x="3" y="8" width="3" height="3" />
    <rect x="8.5" y="8" width="3" height="3" />
    <rect x="14" y="8" width="3" height="3" />
  </svg>
);

/** 8-bit Pixel Trophy / Event Flag */
export const PixelEventIcon: React.FC<PixelIconProps> = ({ className = 'w-5 h-5', size, color }) => (
  <svg
    viewBox="0 0 20 20"
    fill={color || 'currentColor'}
    shapeRendering="crispEdges"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-hidden="true"
  >
    {/* Trophy Cup Rim */}
    <rect x="5" y="3" width="10" height="2" />
    {/* Trophy Cup Body */}
    <rect x="6" y="5" width="8" height="5" />
    <rect x="7" y="10" width="6" height="2" />
    {/* Handles */}
    <rect x="3" y="4" width="2" height="4" />
    <rect x="5" y="7" width="1" height="1" />
    <rect x="15" y="4" width="2" height="4" />
    <rect x="14" y="7" width="1" height="1" />
    {/* Stem */}
    <rect x="9" y="12" width="2" height="3" />
    {/* Base */}
    <rect x="6" y="15" width="8" height="2" />
  </svg>
);

/** 8-bit Pixel Boombox (Dance Style Icon) */
export const PixelStyleIcon: React.FC<PixelIconProps> = ({ className = 'w-5 h-5', size, color }) => (
  <svg
    viewBox="0 0 20 20"
    fill={color || 'currentColor'}
    shapeRendering="crispEdges"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-hidden="true"
  >
    {/* Boombox Handle */}
    <rect x="6" y="2" width="8" height="2" />
    <rect x="6" y="4" width="2" height="2" />
    <rect x="12" y="4" width="2" height="2" />
    {/* Boombox Body */}
    <rect x="2" y="6" width="16" height="10" />
    {/* Left Speaker */}
    <rect x="4" y="8" width="3" height="3" fill="var(--night-2, #0d0f18)" />
    <rect x="5" y="9" width="1" height="1" />
    {/* Right Speaker */}
    <rect x="13" y="8" width="3" height="3" fill="var(--night-2, #0d0f18)" />
    <rect x="14" y="9" width="1" height="1" />
    {/* Cassette Door */}
    <rect x="8" y="8" width="4" height="4" fill="var(--night-2, #0d0f18)" />
    {/* Control Buttons */}
    <rect x="8" y="13" width="1" height="1" />
    <rect x="10" y="13" width="1" height="1" />
  </svg>
);

/** 8-bit Pixel Instructor with Cap & Headset */
export const PixelInstructorIcon: React.FC<PixelIconProps> = ({ className = 'w-5 h-5', size, color }) => (
  <svg
    viewBox="0 0 20 20"
    fill={color || 'currentColor'}
    shapeRendering="crispEdges"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-hidden="true"
  >
    {/* Cap */}
    <rect x="7" y="2" width="6" height="2" />
    <rect x="13" y="3" width="2" height="1" />
    {/* Head */}
    <rect x="7" y="4" width="6" height="4" />
    {/* Headset / Mic */}
    <rect x="5" y="4" width="2" height="3" />
    <rect x="6" y="7" width="2" height="1" />
    <rect x="8" y="7" width="1" height="1" />
    {/* Torso */}
    <rect x="5" y="9" width="10" height="6" />
    {/* Whistle on Chest */}
    <rect x="9.5" y="10" width="1" height="2" fill="var(--neon-gold, #ffe600)" />
    {/* Bottom Base */}
    <rect x="4" y="15" width="12" height="2" />
  </svg>
);

/** 8-bit Pixel Crown / Admin Badge */
export const PixelRoleIcon: React.FC<PixelIconProps> = ({ className = 'w-5 h-5', size, color }) => (
  <svg
    viewBox="0 0 20 20"
    fill={color || 'currentColor'}
    shapeRendering="crispEdges"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-hidden="true"
  >
    {/* 3 Crown peaks */}
    <rect x="3" y="5" width="3" height="3" />
    <rect x="8.5" y="3" width="3" height="3" />
    <rect x="14" y="5" width="3" height="3" />
    {/* Upper Connectors */}
    <rect x="4" y="8" width="12" height="2" />
    {/* Crown Base */}
    <rect x="3" y="10" width="14" height="4" />
    {/* Embedded Jewels */}
    <rect x="5" y="11" width="2" height="2" fill="var(--night-2, #0d0f18)" />
    <rect x="9" y="11" width="2" height="2" fill="var(--night-2, #0d0f18)" />
    <rect x="13" y="11" width="2" height="2" fill="var(--night-2, #0d0f18)" />
    {/* Gold Rim */}
    <rect x="4" y="14" width="12" height="2" />
  </svg>
);

/** 8-bit Pixel Settings Gear */
export const PixelSettingIcon: React.FC<PixelIconProps> = ({ className = 'w-5 h-5', size, color }) => (
  <svg
    viewBox="0 0 20 20"
    fill={color || 'currentColor'}
    shapeRendering="crispEdges"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-hidden="true"
  >
    {/* North / South Teeth */}
    <rect x="8" y="1" width="4" height="3" />
    <rect x="8" y="16" width="4" height="3" />
    {/* West / East Teeth */}
    <rect x="1" y="8" width="3" height="4" />
    <rect x="16" y="8" width="3" height="4" />
    {/* Corner Teeth */}
    <rect x="3" y="3" width="3" height="3" />
    <rect x="14" y="3" width="3" height="3" />
    <rect x="3" y="14" width="3" height="3" />
    <rect x="14" y="14" width="3" height="3" />
    {/* Outer Gear Ring */}
    <rect x="4" y="4" width="12" height="12" />
    {/* Center Hollow Hole */}
    <rect x="7" y="7" width="6" height="6" fill="var(--night-2, #0d0f18)" />
    {/* Center Core Axle */}
    <rect x="9" y="9" width="2" height="2" />
  </svg>
);

/** 8-bit Pixel Eye Open */
export const PixelEyeOpenIcon: React.FC<PixelIconProps> = ({ className = 'w-5 h-5', size, color }) => (
  <svg
    viewBox="0 0 20 20"
    fill={color || 'currentColor'}
    shapeRendering="crispEdges"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-hidden="true"
  >
    <rect x="6" y="5" width="8" height="2" />
    <rect x="4" y="7" width="2" height="2" />
    <rect x="14" y="7" width="2" height="2" />
    <rect x="2" y="9" width="2" height="2" />
    <rect x="16" y="9" width="2" height="2" />
    <rect x="4" y="11" width="2" height="2" />
    <rect x="14" y="11" width="2" height="2" />
    <rect x="6" y="13" width="8" height="2" />
    {/* Pupil */}
    <rect x="8" y="8" width="4" height="4" />
    <rect x="9" y="9" width="2" height="2" fill="var(--night-2, #0d0f18)" />
  </svg>
);

/** 8-bit Pixel Eye Closed */
export const PixelEyeClosedIcon: React.FC<PixelIconProps> = ({ className = 'w-5 h-5', size, color }) => (
  <svg
    viewBox="0 0 20 20"
    fill={color || 'currentColor'}
    shapeRendering="crispEdges"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-hidden="true"
  >
    <rect x="2" y="10" width="16" height="2" />
    {/* Lashes */}
    <rect x="3" y="12" width="2" height="3" />
    <rect x="7" y="12" width="2" height="4" />
    <rect x="11" y="12" width="2" height="4" />
    <rect x="15" y="12" width="2" height="3" />
  </svg>
);

/** 8-bit Pixel Search Magnifier */
export const PixelSearchIcon: React.FC<PixelIconProps> = ({ className = 'w-5 h-5', size, color }) => (
  <svg
    viewBox="0 0 20 20"
    fill={color || 'currentColor'}
    shapeRendering="crispEdges"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    aria-hidden="true"
  >
    {/* Glass Rim */}
    <rect x="5" y="2" width="6" height="2" />
    <rect x="3" y="4" width="2" height="6" />
    <rect x="11" y="4" width="2" height="6" />
    <rect x="5" y="10" width="6" height="2" />
    {/* Inner Lens Shine */}
    <rect x="6" y="5" width="2" height="2" fill="var(--neon-cyan, #00f0ff)" />
    {/* Diagonal Handle */}
    <rect x="11" y="11" width="3" height="3" />
    <rect x="14" y="14" width="4" height="4" />
  </svg>
);
