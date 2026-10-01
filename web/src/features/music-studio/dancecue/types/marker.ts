// Ported from DanceCue by JzeAnson (https://github.com/JzeAnson/DanceCue), used with permission.

export type Marker = {
  id: string;
  endTime: number;
  name: string;
  time: number;
  isReadOnly?: boolean;
  videoId?: string;
  videoStart?: number;
};
