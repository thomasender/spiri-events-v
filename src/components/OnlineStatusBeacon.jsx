import { useOnlineBeacon } from '../hooks/useOnlineStatus';

// Renders nothing; keeps the heartbeat of people who share their online status.
export default function OnlineStatusBeacon() {
  useOnlineBeacon();
  return null;
}
