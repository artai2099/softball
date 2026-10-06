"use client";

import { useMemo, useState } from "react";
import { defensivePositions } from "@/lib/scoring";
import type { GameLineupPlayerView } from "@/lib/types";

type RosterPlayer = {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number;
};

type Props = {
  gameId: string;
  gameVersion: number;
  gameStatus: string;
  lineup: GameLineupPlayerView[];
  players: RosterPlayer[];
  canScore: boolean;
};

export function SubstitutionPanel({
  gameId,
  gameVersion,
  gameStatus,
  lineup,
  players,
  canScore,
}: Props) {
  const [outgoingId, setOutgoingId] = useState("");
  const [incomingId, setIncomingId] = useState("");
  const [position, setPosition] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const activeLineup = useMemo(
    () =>
      [...lineup]
        .filter(
          player =>
            player.active &&
            player.batting_order != null,
        )
        .sort(
          (a, b) =>
            (a.batting_order ?? 0) -
            (b.batting_order ?? 0),
        ),
    [lineup],
  );

  const outgoing = activeLineup.find(
    player => player.player_id === outgoingId,
  );

  const availablePlayers = useMemo(
    () =>
      players
        .filter(
          player =>
            !lineup.some(
              lineupPlayer =>
                lineupPlayer.player_id === player.id,
            ),
        )
        .sort((a, b) => {
          if (a.jersey_number !== b.jersey_number) {
            return a.jersey_number - b.jersey_number;
          }

          return `${a.last_name} ${a.first_name}`.localeCompare(
            `${b.last_name} ${b.first_name}`,
          );
        }),
    [players, lineup],
  );

  if (!canScore || gameStatus !== "live" || lineup.length === 0) {
    return null;
  }

  async function submit() {
    if (!outgoing || !incomingId) {
      setMessage("Select a player out and a replacement.");
      return;
    }

    if (outgoing.batting_order == null) {
      setMessage("The selected player has no batting-order spot.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/games/${gameId}/substitution`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            outgoingPlayerId: outgoing.player_id,
            incomingPlayerId: incomingId,
            battingOrder: outgoing.batting_order,
            position:
              position.trim() ||
              outgoing.position ||
              "",
            expectedVersion: gameVersion,
          }),
        },
      );

      const contentType =
        response.headers.get("content-type") || "";

      const body = contentType.includes("application/json")
        ? await response.json()
        : {
            error:
              `Substitution server returned HTTP ${response.status}`,
          };

      if (!response.ok) {
        throw new Error(
          body.error ||
            "Substitution could not be completed",
        );
      }

      window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Substitution could not be completed",
      );
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <div className="liveLabel">
        SUBSTITUTION
      </div>

      <p className="notice">
        Replace a player while keeping the same batting-order spot.
      </p>

      <div className="form" style={{ marginTop: 12 }}>
        <label>
          Player out
          <select
            value={outgoingId}
            onChange={event => {
              const id = event.target.value;
              setOutgoingId(id);
              setIncomingId("");

              const player = activeLineup.find(
                item => item.player_id === id,
              );

              setPosition(player?.position || "");
              setMessage("");
            }}
            disabled={saving}
          >
            <option value="">
              Select player
            </option>

            {activeLineup.map(player => (
              <option
                key={player.id}
                value={player.player_id}
              >
                {player.batting_order}. #
                {player.jersey_number}{" "}
                {player.first_name} {player.last_name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Player in
          <select
            value={incomingId}
            onChange={event =>
              setIncomingId(event.target.value)
            }
            disabled={saving || !outgoingId}
          >
            <option value="">
              Select replacement
            </option>

            {availablePlayers.map(player => (
              <option
                key={player.id}
                value={player.id}
              >
                #{player.jersey_number}{" "}
                {player.first_name} {player.last_name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Position
          <select
            value={position}
            onChange={event =>
              setPosition(event.target.value)
            }
            disabled={saving || !outgoingId}
          >
            <option value="">
              Keep current position
            </option>

            {defensivePositions.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        {outgoing && (
          <p className="notice">
            Batting spot {outgoing.batting_order}
            {" · "}
            {position
              ? `Position ${position}`
              : outgoing.position
                ? `Position ${outgoing.position}`
                : "Position unchanged"}
          </p>
        )}

        {message && (
          <p className="error" role="alert">
            {message}
          </p>
        )}

        <button
          type="button"
          className="button primary"
          disabled={
            saving ||
            !outgoingId ||
            !incomingId
          }
          onClick={() => void submit()}
        >
          {saving
            ? "Saving substitution..."
            : "MAKE SUBSTITUTION"}
        </button>
      </div>
    </section>
  );
}
