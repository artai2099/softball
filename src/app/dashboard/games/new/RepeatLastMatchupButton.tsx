"use client";

export default function RepeatLastMatchupButton() {
  return (
    <button
      type="reset"
      className="button secondary"
      onClick={() => {
        window.setTimeout(() => {
          document.dispatchEvent(new CustomEvent("gameday-repeat-matchup-reset"));
        }, 0);
      }}
    >
      Repeat last matchup
    </button>
  );
}
