import { useEffect, useState } from "react";
import type { Appointment } from "../../../domain/schedule/scheduleTypes";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { isAppointmentReadyForOfflineEntry } from "../../../domain/schedule/appointmentOfflineHandoff";

interface UseChatAppointmentOptions {
  activeRelationship?: CharacterRelationship;
  appointments: readonly Appointment[];
}

/** Keeps appointment readiness refreshes outside the main chat component. */
export function useChatAppointment({ activeRelationship, appointments }: UseChatAppointmentOptions): Appointment | undefined {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!activeRelationship) return undefined;
  return appointments.find((appointment) => appointment.relationId === activeRelationship.id
    && appointment.characterId === activeRelationship.characterId
    && appointment.userIdentityId === activeRelationship.userIdentityId
    && isAppointmentReadyForOfflineEntry(appointment, now));
}
