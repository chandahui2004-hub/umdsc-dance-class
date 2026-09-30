// Ported from DanceCue by JzeAnson (https://github.com/JzeAnson/DanceCue), used with permission.

import { useCallback, useMemo, useRef, useState } from "react";
import type { Marker } from "../types/marker";

type CommandHandlers = {
  markers: Marker[];
  onForward: (seconds: number) => void;
  onJumpToMarker: (marker: Marker) => void;
  onLoopMarker: (marker: Marker) => void;
  onPause: () => void;
  onPlay: () => void;
  onRestart: () => void;
  onRewind: (seconds: number) => void;
  onStopLoop: () => void;
};

type CommandMatch = {
  label: string;
  handled: boolean;
};

const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
};

const numberWordByDigit = Object.entries(numberWords).reduce<Record<string, string>>(
  (numbers, [word, value]) => ({ ...numbers, [String(value)]: word }),
  {},
);

const loopCommandWords = ["loop", "loops", "looping", "look", "looks", "looking", "luke"];
const stopLoopPhrases = loopCommandWords.map((word) => `stop ${word}`);

function parseSeconds(command: string, fallback: number) {
  const digitMatch = command.match(/\b(\d+)\b/);

  if (digitMatch) {
    return Number(digitMatch[1]);
  }

  const wordMatch = Object.entries(numberWords).find(([word]) => command.includes(word));
  return wordMatch?.[1] ?? fallback;
}

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasCommandPhrase(command: string, phrases: string[]) {
  const paddedCommand = ` ${command} `;
  return phrases.some((phrase) => paddedCommand.includes(` ${phrase} `));
}

function findMarker(command: string, markers: Marker[]) {
  const normalizedCommand = ` ${normalize(command)} `;
  const markerPhrases = getMarkerPhrases(command);
  const markerCandidates = markers.flatMap((marker) =>
    getMarkerAliases(marker.name).map((alias) => ({
      alias,
      marker,
      score: alias.length,
    })),
  );

  const exactMatch = markerCandidates
    .filter(({ alias }) => normalizedCommand.includes(` ${alias} `))
    .sort((a, b) => b.score - a.score)[0]?.marker;

  if (exactMatch) {
    return exactMatch;
  }

  return markerCandidates
    .flatMap(({ alias, marker }) =>
      markerPhrases.map((phrase) => ({
        marker,
        score: getPhraseSimilarity(alias, phrase) * alias.length,
        similarity: getPhraseSimilarity(alias, phrase),
      })),
    )
    .filter(({ similarity }) => similarity >= 0.74)
    .sort((a, b) => b.score - a.score)[0]?.marker;
}

function getMarkerAliases(name: string) {
  const normalizedName = normalize(name);
  const aliases = new Set([normalizedName]);
  const words = normalizedName.split(" ");

  words.forEach((word, index) => {
    if (numberWordByDigit[word]) {
      const nextWords = [...words];
      nextWords[index] = numberWordByDigit[word];
      aliases.add(nextWords.join(" "));
      return;
    }

    if (numberWords[word]) {
      const nextWords = [...words];
      nextWords[index] = String(numberWords[word]);
      aliases.add(nextWords.join(" "));
    }
  });

  return [...aliases].filter(Boolean);
}

function getMarkerPhrases(command: string) {
  const normalizedCommand = normalize(command);
  const cuePrefixes = ["go to", "goto", "jump to", ...loopCommandWords];
  const phrases = new Set([normalizedCommand]);

  cuePrefixes.forEach((prefix) => {
    const index = normalizedCommand.indexOf(prefix);

    if (index >= 0) {
      phrases.add(normalizedCommand.slice(index + prefix.length).trim());
    }
  });

  return [...phrases].filter(Boolean);
}

function getPhraseSimilarity(markerName: string, heardPhrase: string) {
  const markerWords = markerName.split(" ");
  const heardWords = heardPhrase.split(" ");

  if (markerWords.length > heardWords.length) {
    return 0;
  }

  const possibleStarts = heardWords.length - markerWords.length + 1;
  const scores = Array.from({ length: possibleStarts }, (_, startIndex) => {
    const heardWindow = heardWords.slice(startIndex, startIndex + markerWords.length);
    const wordScores = markerWords.map((word, index) => getWordSimilarity(word, heardWindow[index]));
    return wordScores.reduce((total, score) => total + score, 0) / wordScores.length;
  });

  return Math.max(...scores, 0);
}

function getWordSimilarity(expected: string, heard: string) {
  if (expected === heard) {
    return 1;
  }

  if (
    expected.length >= 4 &&
    heard.length >= 4 &&
    (expected.startsWith(heard) || heard.startsWith(expected))
  ) {
    return 0.92;
  }

  const longestLength = Math.max(expected.length, heard.length);

  if (longestLength === 0) {
    return 1;
  }

  return 1 - getEditDistance(expected, heard) / longestLength;
}

function getEditDistance(left: string, right: string) {
  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  return [...left].reduce((previous, leftChar, leftIndex) => {
    const current = [leftIndex + 1];

    [...right].forEach((rightChar, rightIndex) => {
      current[rightIndex + 1] =
        leftChar === rightChar
          ? previous[rightIndex]
          : Math.min(previous[rightIndex], previous[rightIndex + 1], current[rightIndex]) + 1;
    });

    return current;
  }, previousRow)[right.length];
}

export function useSpeechCommands(handlers: CommandHandlers) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [status, setStatus] = useState("Voice controls are idle.");

  const isSupported = useMemo(
    () => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    [],
  );

  const runCommand = useCallback(
    (rawTranscript: string): CommandMatch => {
      const command = normalize(rawTranscript);
      setLastTranscript(rawTranscript);

      if (!command) {
        return { label: "No command heard", handled: false };
      }

      if (hasCommandPhrase(command, stopLoopPhrases)) {
        handlers.onStopLoop();
        return { label: "Stopped loop", handled: true };
      }

      if (command.includes("pause") || command.includes("stop music")) {
        handlers.onPause();
        return { label: "Paused", handled: true };
      }

      if (command.includes("restart") || command.includes("start over")) {
        handlers.onRestart();
        return { label: "Restarted track", handled: true };
      }

      if (command.includes("play") || command.includes("resume")) {
        handlers.onPlay();
        return { label: "Playing", handled: true };
      }

      if (command.includes("back") || command.includes("rewind")) {
        const seconds = parseSeconds(command, 5);
        handlers.onRewind(seconds);
        return { label: `Back ${seconds} seconds`, handled: true };
      }

      if (command.includes("forward") || command.includes("ahead")) {
        const seconds = parseSeconds(command, 10);
        handlers.onForward(seconds);
        return { label: `Forward ${seconds} seconds`, handled: true };
      }

      if (hasCommandPhrase(command, loopCommandWords)) {
        const marker = findMarker(command, handlers.markers);

        if (marker) {
          handlers.onLoopMarker(marker);
          return { label: `Looping ${marker.name}`, handled: true };
        }
      }

      if (command.includes("go to") || command.includes("jump to")) {
        const marker = findMarker(command, handlers.markers);

        if (marker) {
          handlers.onJumpToMarker(marker);
          return { label: `Jumped to ${marker.name}`, handled: true };
        }
      }

      return { label: `Command not recognized: ${rawTranscript}`, handled: false };
    },
    [handlers],
  );

  const toggleListening = useCallback(() => {
    if (!isSupported) {
      setStatus("Speech recognition is not supported in this browser.");
      return;
    }

    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      setStatus("Voice controls are idle.");
      return;
    }

    const SpeechRecognitionApi = window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognitionApi) {
      return;
    }

    const recognition = new SpeechRecognitionApi();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0]?.transcript ?? "";
      const match = runCommand(transcript);
      setStatus(match.label);
    };

    recognition.onerror = (event) => {
      setStatus(`Voice error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setStatus("Listening for commands...");
  }, [isListening, isSupported, runCommand]);

  return {
    isListening,
    isSupported,
    lastTranscript,
    runCommand,
    status,
    toggleListening,
  };
}
