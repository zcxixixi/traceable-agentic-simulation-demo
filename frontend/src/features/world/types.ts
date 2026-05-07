export type SimulationAgent = {
  id: string;
  name: string;
  role: string;
  zoneId: string;
};

export type SimulationTraceEvent = {
  id: string;
  step: number;
  actorId: string;
  message: string;
};
