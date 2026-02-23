import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, StepForward, RotateCcw, Edit2, Code2, AlertTriangle } from 'lucide-react';

const DEFAULT_CODE = `nop
nop
nop
nop
nop
nop
nop
sub r15, r15, r15
add r0, r15, #23
add r1, r15, #123
add r2, r15, #-455
add r3, r15, #2
nop
str r0, [r15, #140]
str r1, [r15, #144]
str r2, [r15, #148]
str r3, [r15, #152]
nop
add r0, r15, #98
add r1, r15, #125
add r2, r15, #10
add r3, r15, #65
nop
str r0, [r15, #156]
str r1, [r15, #160]
str r2, [r15, #164]
str r3, [r15, #168]
nop
add r0, r15, #-56
add r1, r15, #0
str r0, [r15, #172]
str r1, [r15, #176]
add fp, r15, #196
add sp, r15, #136
b 82
ldr r3, [fp, #-8]
add r3, r3, #1
str r3, [fp, #-12]
b 76
ldr r3, [fp, #-12]
lsl r3, r3, #2
sub r3, r3, #4
add r3, r3, fp
ldr r2, [r3, #-52]
ldr r3, [fp, #-8]
lsl r3, r3, #2
sub r3, r3, #4
add r3, r3, fp
ldr r3, [r3, #-52]
cmp r2, r3
bge 73
ldr r3, [fp, #-12]
lsl r3, r3, #2
sub r3, r3, #4
add r3, r3, fp
ldr r3, [r3, #-52]
str r3, [fp, #-16]
ldr r3, [fp, #-8]
lsl r3, r3, #2
sub r3, r3, #4
add r3, r3, fp
ldr r2, [r3, #-52]
ldr r3, [fp, #-12]
lsl r3, r3, #2
sub r3, r3, #4
add r3, r3, fp
str r2, [r3, #-52]
ldr r3, [fp, #-8]
lsl r3, r3, #2
sub r3, r3, #4
add r3, r3, fp
ldr r2, [fp, #-16]
str r2, [r3, #-52]
ldr r3, [fp, #-12]
add r3, r3, #1
str r3, [fp, #-12]
ldr r3, [fp, #-12]
cmp r3, #9
ble 39
ldr r3, [fp, #-8]
add r3, r3, #1
str r3, [fp, #-8]
ldr r3, [fp, #-8]
cmp r3, #9
ble 35
add r3, r15, #0
add r0, r3, r15
sub sp, fp, #4
ldr fp, [sp, #0]
ldr lr, [sp, #4]
add sp, sp, #8
nop
b 91`;

const INITIAL_CPU_STATE = {
  pc: 0,
  regs: {
    r0: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, r6: 0, r7: 0,
    r8: 0, r9: 0, r10: 0, r11: 0, r12: 0, r13: 0, r14: 0, r15: 0,
    fp: 0, sp: 0, lr: 0
  },
  mem: {},
  flags: { N: false, Z: false, V: false },
  error: null,
  halted: false
};

const executeStep = (prevState, parsedLines) => {
  if (prevState.halted || prevState.pc < 0 || prevState.pc >= parsedLines.length) {
    return { ...prevState, halted: true };
  }

  const line = parsedLines[prevState.pc];
  
  // Skip empty lines or comments
  if (!line || !line.trim() || line.startsWith('//')) {
    return { ...prevState, pc: prevState.pc + 1 };
  }

  // Tokenize line: Replace brackets and commas with spaces, then split
  const tokens = line.replace(/\[|\]|,/g, ' ').trim().split(/\s+/);
  const cmd = tokens[0].toLowerCase();

  let nextPc = prevState.pc + 1;
  const newRegs = { ...prevState.regs };
  const newMem = { ...prevState.mem };
  const newFlags = { ...prevState.flags };

  // Helper to parse registers or immediates
  const getVal = (arg) => {
    if (!arg) return 0;
    if (arg.startsWith('#')) return parseInt(arg.substring(1), 10);
    if (!isNaN(parseInt(arg, 10))) return parseInt(arg, 10); 
    return newRegs[arg] || 0;
  };

  try {
    switch (cmd) {
      case 'nop':
        break;
      case 'add':
        newRegs[tokens[1]] = getVal(tokens[2]) + getVal(tokens[3]);
        break;
      case 'sub':
        newRegs[tokens[1]] = getVal(tokens[2]) - getVal(tokens[3]);
        break;
      case 'str':
        newMem[getVal(tokens[2]) + getVal(tokens[3])] = newRegs[tokens[1]];
        break;
      case 'ldr':
        newRegs[tokens[1]] = newMem[getVal(tokens[2]) + getVal(tokens[3])] || 0;
        break;
      case 'lsl':
        newRegs[tokens[1]] = getVal(tokens[2]) << getVal(tokens[3]);
        break;
      case 'cmp':
        const val1 = getVal(tokens[1]);
        const val2 = getVal(tokens[2]);
        const res = val1 - val2;
        newFlags.N = res < 0;
        newFlags.Z = res === 0;
        // 32-bit signed overflow calculation
        newFlags.V = (((val1 ^ val2) & (val1 ^ res)) < 0);
        break;
      case 'b':
        nextPc = parseInt(tokens[1], 10);
        break;
      case 'bge': // Signed Greater Than or Equal
        if (newFlags.N === newFlags.V) nextPc = parseInt(tokens[1], 10);
        break;
      case 'ble': // Signed Less Than or Equal
        if (newFlags.Z || (newFlags.N !== newFlags.V)) nextPc = parseInt(tokens[1], 10);
        break;
      default:
        throw new Error(`Unknown instruction: ${cmd}`);
    }

    return {
      ...prevState,
      pc: nextPc,
      regs: newRegs,
      mem: newMem,
      flags: newFlags
    };
  } catch (e) {
    return { ...prevState, error: `Line ${prevState.pc}: ${e.message}`, halted: true };
  }
};

export default function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [mode, setMode] = useState('edit'); // 'edit' | 'run'
  const [lines, setLines] = useState([]);
  
  const [cpu, setCpu] = useState(INITIAL_CPU_STATE);
  const [isRunning, setIsRunning] = useState(false);
  const [delay, setDelay] = useState(50); // ms per step

  const activeLineRef = useRef(null);

  // Parse code and switch to Run Mode
  const handleAssemble = () => {
    const parsedLines = code.split('\n');
    setLines(parsedLines);
    setCpu(INITIAL_CPU_STATE);
    setMode('run');
    setIsRunning(false);
  };

  const handleEdit = () => {
    setIsRunning(false);
    setMode('edit');
  };

  const handleStep = () => {
    setCpu(prev => executeStep(prev, lines));
  };

  const handleReset = () => {
    setIsRunning(false);
    setCpu(INITIAL_CPU_STATE);
  };

  // Execution Loop
  useEffect(() => {
    let interval;
    if (isRunning) {
      interval = setInterval(() => {
        setCpu(prev => executeStep(prev, lines));
      }, delay);
    }
    return () => clearInterval(interval);
  }, [isRunning, delay, lines]);

  // Stop auto-running if simulator hits a halt or error
  useEffect(() => {
    if (cpu.halted) setIsRunning(false);
  }, [cpu.halted]);

  // Auto-scroll logic for the execution view
  useEffect(() => {
    if (mode === 'run' && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [cpu.pc, mode]);

  return (
    <div className="h-screen overflow-hidden bg-slate-900 text-slate-200 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-slate-950 border-b border-slate-800 p-4 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center space-x-3">
          <Code2 className="text-blue-500 w-6 h-6" />
          <h1 className="text-xl font-bold tracking-wide">Assembler Simulator</h1>
        </div>
        
        <div className="flex items-center space-x-3 bg-slate-800/50 p-1.5 rounded-lg border border-slate-700/50">
          {mode === 'edit' ? (
            <button 
              onClick={handleAssemble}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors shadow-sm"
            >
              <Play className="w-4 h-4" />
              <span>Assemble & Run</span>
            </button>
          ) : (
            <>
              <button 
                onClick={handleEdit}
                className="flex items-center space-x-2 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                title="Back to Editor"
              >
                <Edit2 className="w-4 h-4" />
                <span>Edit</span>
              </button>
              
              <div className="w-px h-6 bg-slate-700 mx-2" />
              
              <button 
                onClick={handleReset}
                className="p-1.5 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
                title="Reset Simulation"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              
              <button 
                onClick={handleStep}
                disabled={isRunning || cpu.halted}
                className="p-1.5 hover:bg-slate-700 text-slate-300 rounded-md transition-colors disabled:opacity-50"
                title="Step Forward"
              >
                <StepForward className="w-4 h-4" />
              </button>
              
              <button 
                onClick={() => setIsRunning(!isRunning)}
                disabled={cpu.halted}
                className={`flex items-center space-x-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors shadow-sm ${
                  isRunning ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-green-600 hover:bg-green-500 text-white'
                } disabled:opacity-50`}
              >
                {isRunning ? (
                  <><Pause className="w-4 h-4" /><span>Pause</span></>
                ) : (
                  <><Play className="w-4 h-4" /><span>Auto Run</span></>
                )}
              </button>

              <div className="flex items-center space-x-2 ml-4 px-2">
                <span className="text-xs text-slate-400 font-medium">Speed:</span>
                <input 
                  type="range" 
                  min="10" 
                  max="500" 
                  step="10"
                  value={510 - delay} // Invert so right = faster
                  onChange={(e) => setDelay(510 - parseInt(e.target.value))}
                  className="w-24 accent-blue-500"
                />
              </div>
            </>
          )}
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Panel: Editor / Code Viewer */}
        <div className="w-1/2 flex flex-col border-r border-slate-800 bg-slate-900/50">
          <div className="bg-slate-800/80 border-b border-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 shadow-sm z-10">
            {mode === 'edit' ? 'Source Code' : 'Execution Viewer'}
          </div>
          
          <div className="flex-1 overflow-hidden relative">
            {mode === 'edit' ? (
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                spellCheck={false}
                className="w-full h-full bg-transparent p-4 text-slate-300 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500/50"
              />
            ) : (
              <div className="w-full h-full overflow-y-auto bg-slate-900 font-mono text-sm py-4">
                {lines.map((line, idx) => {
                  const isActive = idx === cpu.pc && !cpu.halted;
                  return (
                    <div 
                      key={idx} 
                      ref={isActive ? activeLineRef : null}
                      className={`flex items-center px-4 py-0.5 ${
                        isActive 
                          ? 'bg-blue-600/20 border-l-4 border-blue-500 text-blue-100' 
                          : 'border-l-4 border-transparent text-slate-400 hover:bg-slate-800/50'
                      }`}
                    >
                      <span className="w-10 flex-shrink-0 text-slate-600 select-none text-right pr-4">
                        {idx}
                      </span>
                      <span className="whitespace-pre">{line}</span>
                    </div>
                  );
                })}
                {cpu.halted && cpu.pc >= lines.length && (
                  <div className="flex items-center px-4 py-2 mt-4 text-emerald-400 bg-emerald-900/20 border-l-4 border-emerald-500">
                    <span className="ml-10">-- Execution Completed --</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: CPU State & Memory */}
        <div className="w-1/2 flex flex-col bg-slate-900 overflow-y-auto">
          
          {/* Error Banner */}
          {cpu.error && (
            <div className="m-4 mb-0 p-3 bg-red-900/30 border border-red-800/50 rounded-lg flex items-start space-x-3 text-red-200">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-400" />
              <div>
                <h3 className="font-semibold text-sm">Execution Error</h3>
                <p className="text-xs mt-1 opacity-90">{cpu.error}</p>
              </div>
            </div>
          )}

          {/* CPU Core State */}
          <div className="p-6 pb-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">CPU State</h2>
              
              <div className="flex space-x-4">
                <div className="flex items-center space-x-2 bg-slate-800 px-3 py-1 rounded-md border border-slate-700">
                  <span className="text-xs text-slate-400">PC:</span>
                  <span className="font-mono text-blue-400 font-bold">{cpu.pc}</span>
                </div>
                <div className="flex items-center space-x-2 bg-slate-800 px-3 py-1 rounded-md border border-slate-700">
                  <span className="text-xs text-slate-400">Flags:</span>
                  <div className="flex space-x-2 font-mono text-xs font-bold">
                    <span className={cpu.flags.N ? 'text-rose-400' : 'text-slate-600'}>N</span>
                    <span className={cpu.flags.Z ? 'text-emerald-400' : 'text-slate-600'}>Z</span>
                    <span className={cpu.flags.V ? 'text-amber-400' : 'text-slate-600'}>V</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Registers Grid */}
            <div className="grid grid-cols-4 gap-2">
              {['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15', 'fp', 'sp', 'lr'].map(reg => (
                <div key={reg} className="bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium w-6">{reg}</span>
                  <span className="font-mono text-sm text-slate-200">{cpu.regs[reg]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-800 mt-6" />

          {/* Memory Mapping */}
          <div className="p-6 flex-1">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Active Memory (RAM)</h2>
            
            {Object.keys(cpu.mem).length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm border border-slate-800 border-dashed rounded-lg">
                Memory is completely empty.
              </div>
            ) : (
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-left text-sm font-mono">
                  <thead className="bg-slate-800 text-slate-400">
                    <tr>
                      <th className="px-4 py-2 font-medium">Address (Dec)</th>
                      <th className="px-4 py-2 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {Object.keys(cpu.mem)
                      .map(Number)
                      .sort((a, b) => a - b)
                      .map(addr => (
                        <tr key={addr} className="hover:bg-slate-700/30 transition-colors">
                          <td className="px-4 py-2 text-slate-400">{addr}</td>
                          <td className="px-4 py-2 text-slate-200">{cpu.mem[addr]}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}