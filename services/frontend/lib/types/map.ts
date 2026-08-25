/** The newsroom map. A point is a place; the events are what put it there. */

export type MapEvent = {
  when: string | null;
  summary: string;
  source_name: string;
  url: string;
  signal_id: string;
  signal_title: string;
  profile_id: string | null;
};

export type MapPoint = {
  name: string;
  label: string | null;
  latitude: number;
  longitude: number;
  qid: string | null;
  count: number;
  events: MapEvent[];
};

export type MapOut = {
  points: MapPoint[];
  /** Place names in the reporting that have no coordinates. Surfaced rather
   * than dropped: a map silently missing a third of the reporting is worse than
   * one that says how much it is missing. */
  unresolved: string[];
  unresolved_events: number;
};
