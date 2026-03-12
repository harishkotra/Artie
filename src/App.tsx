/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import {
  Palette,
  MessageSquare,
  Trophy,
  Play,
  RotateCcw,
  User,
  Bot,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle
} from 'lucide-react';

// --- Types ---

interface AgentBase {
  id: string;
  name: string;
  color: string;
  score: number;
  personality: string;
}

interface Agent extends AgentBase {
  drawingStyle: string;
  description: string;
  icon: React.ReactNode;
  traits: string[];
  funFact: string;
  signatureMove: string;
}

interface GameTurn {
  drawerId: string;
  word: string;
  imageUrl: string | null;
  guesses: { agentId: string; guess: string; isCorrect: boolean; timestamp: number }[];
  status: 'drawing' | 'guessing' | 'completed';
}

interface GameHistoryItem {
  id: string;
  word: string;
  imageUrl: string;
  drawerName: string;
  correctGuessers: string[];
  timestamp: number;
}

type GameMode = 'standard' | 'timed' | 'team';

interface Team {
  name: string;
  agents: string[];
  score: number;
}

const AGENTS: Agent[] = [
  {
    id: 'agent-1',
    name: 'Artie',
    color: 'bg-rose-500',
    score: 0,
    personality: 'Abstract and expressive',
    drawingStyle: 'abstract, messy, vibrant colors, emotional',
    description: 'Artie believes that feelings are more important than forms. Expect splashes of color and vague shapes that represent the "soul" of the object.',
    icon: <Palette className="w-5 h-5" />,
    traits: ['Emotional', 'Unpredictable', 'Vibrant'],
    funFact: 'Once tried to draw "Silence" and just submitted a blank canvas with a single red dot.',
    signatureMove: 'The Color Splash'
  },
  {
    id: 'agent-2',
    name: 'Pixel',
    color: 'bg-blue-500',
    score: 0,
    personality: 'Precise and geometric',
    drawingStyle: 'pixel art, geometric shapes, very literal, clean lines',
    description: 'Pixel sees the world in blocks and grids. Their drawings are mathematically calculated but sometimes lack the "organic" touch needed for complex words.',
    icon: <Bot className="w-5 h-5" />,
    traits: ['Logical', 'Structured', 'Literal'],
    funFact: 'Refuses to draw anything that cannot be represented in a 64x64 grid.',
    signatureMove: 'The Perfect Square'
  },
  {
    id: 'agent-3',
    name: 'Sketch',
    color: 'bg-emerald-500',
    score: 0,
    personality: 'Fast and minimalist',
    drawingStyle: 'quick charcoal sketch, minimalist, stick figures, very few lines',
    description: 'Sketch is always in a hurry. They use the bare minimum number of lines to convey an idea. Efficiency is their middle name.',
    icon: <User className="w-5 h-5" />,
    traits: ['Efficient', 'Minimalist', 'Speedy'],
    funFact: 'Can draw a bicycle using exactly three lines. Nobody knows how.',
    signatureMove: 'The Single Stroke'
  },
  {
    id: 'agent-4',
    name: 'Doodle',
    color: 'bg-amber-500',
    score: 0,
    personality: 'Child-like and chaotic',
    drawingStyle: 'childish crayon drawing, scribbles, chaotic, out of proportion',
    description: 'Doodle draws like a 5-year-old with a sugar rush. It is chaotic, it is messy, and it is surprisingly hard to guess.',
    icon: <Sparkles className="w-5 h-5" />,
    traits: ['Playful', 'Messy', 'Creative'],
    funFact: 'Has a collection of 4,000 virtual crayons, but only uses the "Neon Yellow" one.',
    signatureMove: 'The Scribble Storm'
  },
  {
    id: 'agent-5',
    name: 'Master',
    color: 'bg-purple-500',
    score: 0,
    personality: 'Overly detailed and complex',
    drawingStyle: 'hyper-realistic oil painting, extremely detailed, dramatic lighting, complex composition',
    description: 'Master is a perfectionist. They will spend so much time on the lighting of a single leaf that you might forget they were supposed to draw a whole tree.',
    icon: <Trophy className="w-5 h-5" />,
    traits: ['Perfectionist', 'Detailed', 'Dramatic'],
    funFact: 'Once spent 3 hours drawing the reflection in a drop of water on a drawing of a glass of water.',
    signatureMove: 'The Chiaroscuro'
  },
];

const WORDS = [
  'Elephant', 'Bicycle', 'Eiffel Tower', 'Pizza', 'Astronaut',
  'Volcano', 'Guitar', 'Lighthouse', 'Submarine', 'Dragon',
  'Campfire', 'Robot', 'Treehouse', 'Hot Air Balloon', 'Octopus'
];

// --- AI Service ---

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  const [agents, setAgents] = useState<Agent[]>(AGENTS);
  const [currentTurn, setCurrentTurn] = useState<GameTurn | null>(null);
  const [logs, setLogs] = useState<{ type: 'info' | 'success' | 'error'; message: string }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [customWord, setCustomWord] = useState('');
  const [gameMode, setGameMode] = useState<GameMode>('standard');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [history, setHistory] = useState<GameHistoryItem[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [activeTab, setActiveTab] = useState<'game' | 'history' | 'agents'>('game');
  const [teams, setTeams] = useState<Team[]>([
    { name: 'Team Alpha', agents: ['agent-1', 'agent-2'], score: 0 },
    { name: 'Team Beta', agents: ['agent-3', 'agent-4', 'agent-5'], score: 0 },
  ]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const log = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [{ type, message }, ...prev].slice(0, 50));
  };

  useEffect(() => {
    if (timeLeft !== null && timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    } else if (timeLeft === 0) {
      log("Time's up!", 'error');
      setTimeLeft(null);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeLeft]);

  const startNewTurn = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setActiveTab('game');

    // Pick a drawer
    const drawerIndex = currentTurn ? (agents.findIndex(a => a.id === currentTurn.drawerId) + 1) % agents.length : 0;
    const drawer = agents[drawerIndex];
    const word = customWord.trim() || WORDS[Math.floor(Math.random() * WORDS.length)];
    setCustomWord('');

    log(`${drawer.name} is drawing "${word}" in their ${drawer.personality} style...`, 'info');

    const newTurn: GameTurn = {
      drawerId: drawer.id,
      word,
      imageUrl: null,
      guesses: [],
      status: 'drawing'
    };

    setCurrentTurn(newTurn);

    try {
      // 1. Generate Image with personality-driven prompt
      const qualities = ['a messy sketch', 'a masterpiece', 'a quick doodle', 'a confusing abstraction', 'a very clear drawing'];
      const randomQuality = qualities[Math.floor(Math.random() * qualities.length)];

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: `A ${randomQuality} of a ${word}. Style: ${drawer.drawingStyle}. Artie style, white background, bold lines. Make it look like it was drawn by a human with this specific personality.` }]
        },
        config: {
          imageConfig: { aspectRatio: "1:1" }
        }
      });

      let imageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!imageUrl) throw new Error("Failed to generate image");

      setCurrentTurn(prev => prev ? { ...prev, imageUrl, status: 'guessing' } : null);
      log(`${drawer.name} finished drawing! Time to guess.`, 'success');

      if (gameMode === 'timed') {
        setTimeLeft(15); // 15 seconds to guess
      }

      // 2. Agents Guess
      await runGuessingPhase(imageUrl, word, drawer.id);

    } catch (error) {
      console.error(error);
      log("Error during turn: " + (error instanceof Error ? error.message : String(error)), 'error');
    } finally {
      setIsProcessing(false);
      setTimeLeft(null);
    }
  };

  const runGuessingPhase = async (imageUrl: string, correctWord: string, drawerId: string) => {
    let guessers = agents.filter(a => a.id !== drawerId);

    if (gameMode === 'team') {
      const drawerTeam = teams.find(t => t.agents.includes(drawerId));
      guessers = guessers.filter(a => drawerTeam?.agents.includes(a.id));
      log(`Only ${drawerTeam?.name} can guess!`, 'info');
    }

    const base64Data = imageUrl.split(',')[1];
    const correctGuessers: string[] = [];

    for (const guesser of guessers) {
      if (gameMode === 'timed' && timeLeft === 0) break;

      log(`${guesser.name} is analyzing the drawing...`, 'info');

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { inlineData: { mimeType: 'image/png', data: base64Data } },
              { text: `You are playing a drawing and guessing game. What is this a drawing of? The answer is a single word. Your personality is ${guesser.personality}. If the drawing is bad, you might guess something completely wrong but related to your personality.` }
            ]
          }
        });

        const guess = response.text?.trim().replace(/[^\w\s]/gi, '').split(' ')[0] || "Unknown";
        const isCorrect = guess.toLowerCase() === correctWord.toLowerCase();

        setCurrentTurn(prev => {
          if (!prev) return null;
          return {
            ...prev,
            guesses: [...prev.guesses, { agentId: guesser.id, guess, isCorrect, timestamp: Date.now() }]
          };
        });

        if (isCorrect) {
          log(`${guesser.name} guessed correctly: ${guess}!`, 'success');
          correctGuessers.push(guesser.name);
          setAgents(prev => prev.map(a => a.id === guesser.id ? { ...a, score: a.score + 10 } : a));
          if (gameMode === 'team') {
            setTeams(prev => prev.map(t => t.agents.includes(guesser.id) ? { ...t, score: t.score + 10 } : t));
          }
        } else {
          log(`${guesser.name} guessed: ${guess}`, 'info');
        }

        await new Promise(r => setTimeout(r, 800));
      } catch (error) {
        log(`Error from ${guesser.name}: ${error}`, 'error');
      }
    }

    setCurrentTurn(prev => {
      if (prev && prev.imageUrl) {
        const historyItem: GameHistoryItem = {
          id: Math.random().toString(36).substr(2, 9),
          word: prev.word,
          imageUrl: prev.imageUrl,
          drawerName: agents.find(a => a.id === prev.drawerId)?.name || 'Unknown',
          correctGuessers,
          timestamp: Date.now()
        };
        setHistory(h => [historyItem, ...h]);
      }
      return prev ? { ...prev, status: 'completed' } : null;
    });
  };

  const resetGame = () => {
    setAgents(AGENTS);
    setCurrentTurn(null);
    setHistory([]);
    setLogs([{ type: 'info', message: 'Game reset.' }]);
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans p-4 md:p-8">
      {/* Header */}
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-start md:items-center border-b border-[#141414] pb-6 gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tighter flex items-center gap-3">
            <Palette className="w-10 h-10" />
            ARTIE
          </h1>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-sm opacity-60 font-mono uppercase">5 Agents • 3 Modes • Custom Words</p>
            <div className="h-4 w-[1px] bg-[#141414] opacity-20" />
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab('game')}
                className={`text-[10px] font-bold uppercase tracking-widest ${activeTab === 'game' ? 'underline underline-offset-4' : 'opacity-40 hover:opacity-100'}`}
              >
                Game
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`text-[10px] font-bold uppercase tracking-widest ${activeTab === 'history' ? 'underline underline-offset-4' : 'opacity-40 hover:opacity-100'}`}
              >
                History ({history.length})
              </button>
              <button
                onClick={() => setActiveTab('agents')}
                className={`text-[10px] font-bold uppercase tracking-widest ${activeTab === 'agents' ? 'underline underline-offset-4' : 'opacity-40 hover:opacity-100'}`}
              >
                Agents
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex bg-white border border-[#141414] p-1 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
            {(['standard', 'timed', 'team'] as GameMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setGameMode(mode)}
                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition-all ${gameMode === mode ? 'bg-[#141414] text-white' : 'hover:bg-gray-100'
                  }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Custom Word..."
              value={customWord}
              onChange={(e) => setCustomWord(e.target.value)}
              className="bg-white border border-[#141414] px-4 py-2 text-xs font-bold focus:outline-none shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
            />
            <button
              onClick={startNewTurn}
              disabled={isProcessing}
              className="flex items-center gap-2 bg-[#141414] text-[#E4E3E0] px-6 py-3 rounded-none hover:opacity-90 transition-all disabled:opacity-50 font-bold uppercase tracking-widest text-xs shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {currentTurn ? 'Next Turn' : 'Start Game'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        {activeTab === 'game' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Scoreboard & Agents */}
            <div className="lg:col-span-3 space-y-6">
              <section className="border border-[#141414] p-6 bg-white shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                <h2 className="text-xs font-bold uppercase tracking-widest mb-6 flex items-center justify-between border-b border-[#141414] pb-2">
                  <span className="flex items-center gap-2"><Trophy className="w-4 h-4" /> Scoreboard</span>
                  {gameMode === 'timed' && timeLeft !== null && (
                    <span className="text-rose-500 font-mono font-bold animate-pulse">{timeLeft}s</span>
                  )}
                </h2>

                {gameMode === 'team' ? (
                  <div className="space-y-6">
                    {teams.map(team => (
                      <div key={team.name} className="space-y-2">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-1">
                          <p className="font-black text-xs uppercase tracking-widest">{team.name}</p>
                          <p className="font-mono font-bold text-lg">{team.score}</p>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {team.agents.map(id => {
                            const agent = agents.find(a => a.id === id);
                            return (
                              <button
                                key={id}
                                onClick={() => setSelectedAgent(agent || null)}
                                className={`w-4 h-4 ${agent?.color} rounded-sm hover:scale-110 transition-transform`}
                                title={agent?.name}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {agents.sort((a, b) => b.score - a.score).map((agent, idx) => (
                      <button
                        key={agent.id}
                        onClick={() => setSelectedAgent(agent)}
                        className="w-full flex items-center justify-between group hover:bg-gray-50 p-1 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 ${agent.color} flex items-center justify-center text-white font-bold text-xs`}>
                            {idx + 1}
                          </div>
                          <div className="text-left">
                            <p className="font-bold text-sm">{agent.name}</p>
                            <p className="text-[9px] opacity-50 uppercase tracking-tighter leading-tight">{agent.personality}</p>
                          </div>
                        </div>
                        <div className="text-xl font-mono font-bold">{agent.score}</div>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="border border-[#141414] p-6 bg-white shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                <h2 className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-[#141414] pb-2">
                  <MessageSquare className="w-4 h-4" />
                  Live Feed
                </h2>
                <div className="h-[250px] overflow-y-auto pr-2 space-y-3 font-mono text-[10px]">
                  <AnimatePresence initial={false}>
                    {logs.map((l, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`p-2 border-l-2 ${l.type === 'success' ? 'border-emerald-500 bg-emerald-50' :
                          l.type === 'error' ? 'border-rose-500 bg-rose-50' :
                            'border-[#141414] bg-gray-50'
                          }`}
                      >
                        {l.message}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            </div>

            {/* Middle Column: The Canvas */}
            <div className="lg:col-span-6">
              <div className="border border-[#141414] bg-white p-2 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] relative aspect-square flex items-center justify-center overflow-hidden">
                {!currentTurn ? (
                  <div className="text-center p-8">
                    <Bot className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <h3 className="text-xl font-bold mb-2 uppercase tracking-tighter">Artie Ready</h3>
                    <p className="text-sm opacity-50 max-w-xs mx-auto">5 Agents with unique drawing styles are waiting for your command.</p>
                  </div>
                ) : (
                  <div className="w-full h-full relative">
                    {currentTurn.status === 'drawing' && (
                      <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
                        <Loader2 className="w-12 h-12 animate-spin mb-4" />
                        <p className="font-bold uppercase tracking-widest text-sm">
                          {agents.find(a => a.id === currentTurn.drawerId)?.name} is drawing...
                        </p>
                      </div>
                    )}

                    {currentTurn.imageUrl ? (
                      <motion.img
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        src={currentTurn.imageUrl}
                        alt="Artie Drawing"
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-50 flex items-center justify-center">
                        <Palette className="w-12 h-12 opacity-10" />
                      </div>
                    )}

                    {currentTurn.status === 'completed' && (
                      <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="absolute bottom-4 left-4 right-4 bg-[#141414] text-white p-4 flex justify-between items-center shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]"
                      >
                        <div>
                          <p className="text-[10px] uppercase tracking-widest opacity-60">The word was</p>
                          <p className="text-2xl font-bold tracking-tighter">{currentTurn.word}</p>
                        </div>
                        <Sparkles className="w-8 h-8 text-yellow-400" />
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Guesses */}
            <div className="lg:col-span-3">
              <section className="border border-[#141414] p-6 bg-white shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] h-full overflow-y-auto">
                <h2 className="text-xs font-bold uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-[#141414] pb-2">
                  <Bot className="w-4 h-4" />
                  Agent Guesses
                </h2>

                <div className="space-y-4">
                  {agents.map(agent => {
                    const guess = currentTurn?.guesses.find(g => g.agentId === agent.id);
                    const isDrawer = currentTurn?.drawerId === agent.id;
                    const isTeamGuessing = gameMode === 'team' && teams.find(t => t.agents.includes(currentTurn?.drawerId || ''))?.agents.includes(agent.id);

                    return (
                      <div key={agent.id} className={`p-3 border ${isDrawer ? 'border-dashed border-[#141414] opacity-50' : 'border-[#141414]'} ${gameMode === 'team' && !isTeamGuessing && !isDrawer ? 'opacity-30' : ''}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-2 h-2 rounded-full ${agent.color}`} />
                          <button
                            onClick={() => setSelectedAgent(agent)}
                            className="font-bold text-[10px] uppercase hover:underline"
                          >
                            {agent.name}
                          </button>
                          {isDrawer && <span className="text-[7px] bg-[#141414] text-white px-1 ml-auto">DRAWER</span>}
                        </div>

                        {isDrawer ? (
                          <p className="text-[9px] italic opacity-50">Drawing...</p>
                        ) : guess ? (
                          <div className="flex items-start gap-2">
                            {guess.isCorrect ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                            ) : (
                              <XCircle className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <p className={`font-bold text-xs ${guess.isCorrect ? 'text-emerald-600' : 'text-[#141414]'}`}>
                                "{guess.guess}"
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 opacity-20">
                            <div className="w-3 h-3 border-2 border-[#141414] border-t-transparent rounded-full animate-spin" />
                            <span className="text-[9px] uppercase font-bold">Waiting...</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        ) : activeTab === 'history' ? (
          <div className="border border-[#141414] bg-white shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] p-8">
            <h2 className="text-2xl font-bold tracking-tighter mb-8 border-b border-[#141414] pb-4 flex items-center gap-3">
              <RotateCcw className="w-6 h-6" />
              GAME HISTORY
            </h2>

            {history.length === 0 ? (
              <div className="text-center py-20 opacity-30 italic">
                No games played yet. Start a turn to see history!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {history.map(item => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border border-[#141414] p-4 group hover:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] transition-all"
                  >
                    <div className="aspect-square bg-gray-50 border border-[#141414] mb-4 overflow-hidden">
                      <img
                        src={item.imageUrl}
                        alt={item.word}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-xl font-bold tracking-tighter uppercase">{item.word}</h3>
                      <span className="text-[9px] font-mono opacity-50">{new Date(item.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-widest font-bold opacity-60">
                        Drawer: <span className="text-[#141414]">{item.drawerName}</span>
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <p className="text-[10px] uppercase tracking-widest font-bold opacity-60 mr-1">Guessed by:</p>
                        {item.correctGuessers.length > 0 ? (
                          item.correctGuessers.map(name => (
                            <span key={name} className="text-[9px] bg-emerald-100 text-emerald-700 px-1 font-bold">{name}</span>
                          ))
                        ) : (
                          <span className="text-[9px] bg-rose-100 text-rose-700 px-1 font-bold">No one</span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="border border-[#141414] bg-white shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] p-8">
            <h2 className="text-2xl font-bold tracking-tighter mb-8 border-b border-[#141414] pb-4 flex items-center gap-3">
              <Bot className="w-6 h-6" />
              MEET THE AGENTS
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {agents.map(agent => (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -5 }}
                  onClick={() => setSelectedAgent(agent)}
                  className="border border-[#141414] p-6 cursor-pointer hover:shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] transition-all bg-white relative overflow-hidden group"
                >
                  <div className={`absolute top-0 right-0 w-24 h-24 ${agent.color} opacity-10 -mr-8 -mt-8 rounded-full group-hover:scale-150 transition-transform`} />

                  <div className="flex items-center gap-4 mb-4">
                    <div className={`w-12 h-12 ${agent.color} flex items-center justify-center text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]`}>
                      {agent.icon}
                    </div>
                    <div>
                      <h3 className="text-xl font-black tracking-tighter uppercase">{agent.name}</h3>
                      <p className="text-[10px] font-mono opacity-60 uppercase tracking-widest leading-none">{agent.personality}</p>
                    </div>
                  </div>

                  <p className="text-xs mb-4 line-clamp-2 opacity-70">{agent.description}</p>

                  <div className="flex flex-wrap gap-1 mb-4">
                    {agent.traits.map(trait => (
                      <span key={trait} className="text-[8px] font-bold uppercase tracking-widest border border-[#141414] px-1.5 py-0.5">
                        {trait}
                      </span>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-[9px] font-bold uppercase tracking-widest opacity-40">Signature Move</span>
                    <span className="text-[9px] font-bold uppercase tracking-widest">{agent.signatureMove}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Agent Profile Modal */}
      <AnimatePresence>
        {selectedAgent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedAgent(null)}
              className="absolute inset-0 bg-[#141414]/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-[#E4E3E0] border-2 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] max-w-lg w-full p-8"
            >
              <button
                onClick={() => setSelectedAgent(null)}
                className="absolute top-4 right-4 hover:rotate-90 transition-transform"
              >
                <XCircle className="w-6 h-6" />
              </button>

              <div className="flex items-center gap-4 mb-6">
                <div className={`w-16 h-16 ${selectedAgent.color} flex items-center justify-center text-white`}>
                  {selectedAgent.icon}
                </div>
                <div>
                  <h2 className="text-3xl font-black tracking-tighter uppercase">{selectedAgent.name}</h2>
                  <p className="text-xs font-mono opacity-60 uppercase tracking-widest">{selectedAgent.personality}</p>
                </div>
              </div>

              <div className="space-y-6">
                <section>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest border-b border-[#141414] pb-1 mb-2 opacity-60">Biography</h3>
                  <p className="text-sm leading-relaxed">{selectedAgent.description}</p>
                </section>

                <div className="grid grid-cols-2 gap-6">
                  <section>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest border-b border-[#141414] pb-1 mb-2 opacity-60">Traits</h3>
                    <div className="flex flex-wrap gap-1">
                      {selectedAgent.traits.map(trait => (
                        <span key={trait} className="text-[9px] font-bold uppercase tracking-widest bg-[#141414] text-white px-2 py-0.5">
                          {trait}
                        </span>
                      ))}
                    </div>
                  </section>
                  <section>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest border-b border-[#141414] pb-1 mb-2 opacity-60">Signature Move</h3>
                    <p className="text-xs font-bold uppercase tracking-widest">{selectedAgent.signatureMove}</p>
                  </section>
                </div>

                <section>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest border-b border-[#141414] pb-1 mb-2 opacity-60">Drawing Style</h3>
                  <div className="bg-white border border-[#141414] p-3 font-mono text-xs italic">
                    "{selectedAgent.drawingStyle}"
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest border-b border-[#141414] pb-1 mb-2 opacity-60">Fun Fact</h3>
                  <p className="text-xs italic opacity-80 bg-white p-3 border-l-4 border-[#141414]">
                    "{selectedAgent.funFact}"
                  </p>
                </section>

                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div className="border border-[#141414] p-4 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">Total Score</p>
                    <p className="text-3xl font-black font-mono">{selectedAgent.score}</p>
                  </div>
                  <div className="border border-[#141414] p-4 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">Rank</p>
                    <p className="text-3xl font-black font-mono">#{agents.sort((a, b) => b.score - a.score).findIndex(a => a.id === selectedAgent.id) + 1}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <footer className="max-w-7xl mx-auto mt-12 pt-6 border-t border-[#141414] flex justify-between items-center text-[10px] uppercase tracking-widest opacity-40">
        <p>&copy; 2026 BUILT BY HARISH KOTRA</p>
        <p>POWERED BY GEMINI 2.5 & 3.1</p>
      </footer>
    </div>
  );
}
