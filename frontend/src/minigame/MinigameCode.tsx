import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MinigamePuzzleMsg, Solution } from "./App";
import { getTokenTypes } from "../player/highlight";

function prepareSolution(lines: Solution): Solution {
  return lines.map((line) => line.map((token) => (typeof token === "string" ? token : -1)));
}

/** Adds the given token to the first free slot in the solution. */
function addTokenToSolution(solution: Solution, token: number): Solution {
  const newSolution = solution.map((line) => [...line]);
  for (let i = 0; i < newSolution.length; i++) {
    for (let j = 0; j < newSolution[i].length; j++) {
      if (newSolution[i][j] === -1) {
        newSolution[i][j] = token;
        return newSolution;
      }
    }
  }
  return newSolution;
}

/** Removes the given token from the solution. */
function removeTokenFromSolution(solution: Solution, token: number): Solution {
  return solution.map((line) => line.map((t) => (t === token ? -1 : t)));
}

function walkSolution<T>(
  puzzle: MinigamePuzzleMsg,
  solution: Solution,
  callback: (token: string | number) => T,
): T[][] {
  const templateLines = puzzle.template.split("\n");
  return templateLines.flatMap((line): T[][] => {
    const parts = line.split("|", 2);
    if (parts.length === 1) {
      callback("\n");
      return [[callback(line)]];
    }
    const [before, after] = parts;
    const indent = before.match(/^\s*/)![0];
    return solution.map((solLine, i): T[] => {
      callback("\n");
      return [
        ...(i === 0 ? [callback(before)] : [callback(indent)]),
        ...solLine.map(callback),
        ...(i === solution.length - 1 ? [callback(after)] : []),
      ];
    });
  });
}

export function MinigameCode({
  puzzle,
  incorrect,
  disabled,
  onSubmit,
}: {
  puzzle: MinigamePuzzleMsg;
  incorrect: boolean;
  disabled: boolean;
  onSubmit: (solution: Solution) => void;
}) {
  const [solution, setSolution] = useState(() => prepareSolution(puzzle.solution_lines));
  const [rateLimit, setRateLimit] = useState<number | null>(null);
  useEffect(() => {
    setSolution(prepareSolution(puzzle.solution_lines));
  }, [puzzle]);

  console.log(solution);

  const tokensInSolution = new Set(solution.flat());

  const [renderedSolution] = useMemo(() => {
    const textLines = walkSolution(puzzle, solution, (token) =>
      typeof token === "string" ? token : token === -1 ? "___" : puzzle.tokens[token],
    );
    const chars = textLines.map((line) => line.join("").split(""));
    const tokenTypes = getTokenTypes(chars);
    const renderedLines: ReactNode[] = [];
    let i = -1;
    let j = 0;
    return [
      walkSolution(puzzle, solution, (token): ReactNode => {
        const key = j;
        if (token === "\n") {
          console.log("line");
          i++;
          j = 0;
          renderedLines.push([]);
          return null;
        }
        if (token === -1) {
          j += 3; // ___
          return (
            <span key={key} className="px-2 py-0 rounded-full bg-gray-500">
              &nbsp;
            </span>
          );
        }
        const text = typeof token === "string" ? token : puzzle.tokens[token];
        console.log("text", text, "chars", chars[i].slice(j, j + text.length));
        const highlitChars = text.split("").map((char, k) => {
          const tokenType = tokenTypes[i]?.[j++];
          return (
            <span key={k} className={tokenType ? `token ${tokenType}` : ""}>
              {char}
            </span>
          );
        });
        return typeof token === "string" ? (
          <Fragment key={key}>{highlitChars}</Fragment>
        ) : (
          <span
            key={key}
            className="border border-gray-300 rounded-full px-2 py-0 cursor-pointer"
            onClick={() => {
              setSolution((prev) => removeTokenFromSolution(prev, token));
            }}
          >
            {highlitChars}
          </span>
        );
      }).map((line, i) => (
        <div key={i} className="whitespace-pre-wrap items-baseline flex flex-wrap">
          {line}
        </div>
      )),
      chars,
    ];
  }, [puzzle, solution]);

  const handleSubmit = () => {
    onSubmit(solution.map((line) => line.map((token) => (typeof token === "string" ? token : puzzle.tokens[token]))));
    const timeout = setTimeout(() => setRateLimit(null), 5000);
    setRateLimit(timeout);
  };

  return (
    <>
      <div className="flex-1 border-b border-gray-500 font-mono p-3">{renderedSolution}</div>
      <div className="flex flex-wrap gap-2 justify-center content-start p-3 pt-0">
        {puzzle.tokens.map((token, i) => (
          <button
            key={i}
            className="px-4 py-2 border hover:border-blue-300 cursor-pointer rounded font-mono whitespace-nowrap disabled:border-gray-500 disabled:text-gray-500 disabled:cursor-not-allowed"
            onClick={() => {
              setSolution((prev) => addTokenToSolution(prev, i));
            }}
            disabled={tokensInSolution.has(i)}
          >
            {token}
          </button>
        ))}
      </div>
      <button
        className={`
          px-4
          py-2
          w-full
          text-lg
          bg-green-600
          hover:bg-green-500
          cursor-pointer
          rounded
          text-white
          font-bold
          ${rateLimit ? (incorrect ? "incorrect ratelimit" : "ratelimit") : "disabled:bg-gray-600"}
          disabled:cursor-not-allowed`}
        onClick={handleSubmit}
        disabled={solution.flat().includes(-1) || rateLimit != null || disabled}
      >
        {incorrect && rateLimit ? "Incorrect" : "Submit"}
      </button>
    </>
  );
}
