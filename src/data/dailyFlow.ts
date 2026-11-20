import type { SubjectId, TaskKind } from '../types';

/**
 * The fixed rhythm the operator actually lives by. Study blocks are generated
 * as tasks; the surrounding life blocks are rendered as a non-interactive
 * timeline so the board stays focused on work while the day still has shape.
 */
export type FlowCategory = 'study' | 'gym' | 'meal' | 'break' | 'nap' | 'walk' | 'prep' | 'buffer';

export interface FlowBlock {
  id: string;
  start: string;
  duration: number;
  label: string;
  short: string;
  category: FlowCategory;
  studyRole?: FlowRole;
}

export type FlowRole =
  | 'pyq'
  | 'core'
  | 'practice'
  | 'revision'
  | 'test'
  | 'mock'
  | 'analysis'
  | 'night'
  | 'rest-morning'
  | 'rest-walk'
  | 'rest-sleep';

export interface FlowStudyBlock {
  role: FlowRole;
  label: string;
  short: string;
  start: string;
  duration: number;
  kind: TaskKind;
}

export type PlanMode = 'study' | 'mock' | 'revision' | 'rest';

export interface PlanDay {
  date: string;
  subjectId?: SubjectId;
  subjectLabel: string;
  core: string;
  topicId?: string;
  sessionNo?: number;
  revision: string;
  revisionSubjectId?: SubjectId;
  test: string;
  mode: PlanMode;
  mockNo?: number;
}

export const FLOW_VERSION = 4;
export const FLOW_PLAN_START = '2026-11-15';
export const FLOW_PLAN_END = '2027-02-06';
export const FLOW_STUDY_MINUTES = 420;

export const DAILY_FLOW: FlowBlock[] = [
  { id: 'gym', start: '06:30', duration: 90, label: 'Gym — max 1.5 hrs', short: 'Gym', category: 'gym' },
  { id: 'walk-home', start: '08:00', duration: 15, label: 'Walk home & reset', short: 'Walk', category: 'walk' },
  { id: 'prep', start: '08:15', duration: 75, label: 'Bath, breakfast & prep', short: 'Prep', category: 'prep' },
  { id: 'study-1', start: '09:30', duration: 60, label: 'PYQ reconnaissance & analysis', short: 'PYQ recon', category: 'study', studyRole: 'pyq' },
  { id: 'break-1', start: '10:30', duration: 30, label: 'YouTube channel / relax', short: 'Break', category: 'break' },
  { id: 'study-2', start: '11:00', duration: 120, label: 'Core topic deep dive', short: 'Core dive', category: 'study', studyRole: 'core' },
  { id: 'buffer', start: '13:00', duration: 60, label: 'Buffer / free time', short: 'Buffer', category: 'buffer' },
  { id: 'lunch', start: '14:00', duration: 30, label: 'Lunch', short: 'Lunch', category: 'meal' },
  { id: 'nap', start: '14:30', duration: 90, label: 'Afternoon nap', short: 'Nap', category: 'nap' },
  { id: 'study-3', start: '16:00', duration: 120, label: 'Practice PYQs & problem solving', short: 'Practice', category: 'study', studyRole: 'practice' },
  { id: 'break-2', start: '18:00', duration: 30, label: 'YouTube channel / relax', short: 'Break', category: 'break' },
  { id: 'study-4', start: '18:30', duration: 60, label: 'Revision of earlier topics', short: 'Revision', category: 'study', studyRole: 'revision' },
  { id: 'walk-evening', start: '19:30', duration: 60, label: 'Evening walk', short: 'Walk', category: 'walk' },
  { id: 'study-5', start: '20:30', duration: 60, label: 'Validation test / mini-mock', short: 'Test', category: 'study', studyRole: 'test' },
  { id: 'dinner', start: '21:30', duration: 30, label: 'Dinner', short: 'Dinner', category: 'meal' },
  { id: 'wind-down', start: '22:00', duration: 30, label: 'Wind down & light YouTube', short: 'Wind down', category: 'break' },
];

export const DEFAULT_STUDY_FLOW: FlowStudyBlock[] = [
  { role: 'pyq', label: 'PYQ reconnaissance & analysis', short: 'PYQ recon', start: '09:30', duration: 60, kind: 'pyq' },
  { role: 'core', label: 'Core topic deep dive', short: 'Core dive', start: '11:00', duration: 120, kind: 'study' },
  { role: 'practice', label: 'Practice PYQs & problem solving', short: 'Practice', start: '16:00', duration: 120, kind: 'practice' },
  { role: 'revision', label: 'Revision of earlier topics', short: 'Revision', start: '18:30', duration: 60, kind: 'revision' },
  { role: 'test', label: 'Validation test / mini-mock', short: 'Test', start: '20:30', duration: 60, kind: 'test' },
];

export const MOCK_STUDY_FLOW = (mockNo: number): FlowStudyBlock[] => [
  { role: 'mock', label: `Full-length mock exam ${mockNo}`, short: 'Full mock', start: '09:30', duration: 180, kind: 'mock' },
  { role: 'analysis', label: 'Mock autopsy & repair list', short: 'Autopsy', start: '16:00', duration: 120, kind: 'analysis' },
  { role: 'revision', label: 'Formula & pattern recall', short: 'Recall', start: '18:30', duration: 60, kind: 'revision' },
  { role: 'night', label: 'Error log & shutdown', short: 'Error log', start: '20:30', duration: 60, kind: 'analysis' },
];

export const REVISION_STUDY_FLOW: FlowStudyBlock[] = [
  { role: 'pyq', label: 'Formula recall — morning pass', short: 'Formula I', start: '09:30', duration: 60, kind: 'revision' },
  { role: 'core', label: 'Full formula sheet pass', short: 'Formula II', start: '11:00', duration: 120, kind: 'revision' },
  { role: 'practice', label: 'Weak-area repair — no new questions', short: 'Repair', start: '16:00', duration: 120, kind: 'revision' },
  { role: 'revision', label: 'Trap list & pattern recall', short: 'Trap list', start: '18:30', duration: 60, kind: 'revision' },
  { role: 'test', label: 'Light skim, then close the books', short: 'Light skim', start: '20:30', duration: 60, kind: 'revision' },
];

export const REST_STUDY_FLOW: FlowStudyBlock[] = [
  { role: 'rest-morning', label: 'Rest & mental prep', short: 'Rest', start: '09:30', duration: 60, kind: 'rest' },
  { role: 'rest-walk', label: 'Walk & reset', short: 'Walk', start: '18:30', duration: 60, kind: 'rest' },
  { role: 'rest-sleep', label: 'Sleep early — protect the engine', short: 'Sleep', start: '20:30', duration: 30, kind: 'rest' },
];

export const STUDY_PLAN: PlanDay[] = [
  { date: '2026-11-15', subjectId: 'dm', subjectLabel: 'Engineering & Discrete Math', core: 'Propositional & First-Order Logic', topicId: 'dm-logic', sessionNo: 1, revision: 'General Aptitude', revisionSubjectId: 'ga', test: 'Weekly Mini-Mock', mode: 'study' },
  { date: '2026-11-16', subjectId: 'dm', subjectLabel: 'Engineering & Discrete Math', core: 'Sets, Relations, Functions', topicId: 'dm-sets', sessionNo: 1, revision: 'General Aptitude', revisionSubjectId: 'ga', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-11-17', subjectId: 'dm', subjectLabel: 'Engineering & Discrete Math', core: 'Graph Theory (Bipartite, Trees, Connectivity)', topicId: 'dm-graph', sessionNo: 1, revision: 'Engineering & Discrete Math (Earlier Topics)', revisionSubjectId: 'em', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-11-18', subjectId: 'dm', subjectLabel: 'Engineering & Discrete Math', core: 'Combinatorics (Permutations, Combinations)', topicId: 'dm-comb', sessionNo: 1, revision: 'Engineering & Discrete Math (Earlier Topics)', revisionSubjectId: 'em', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-11-19', subjectId: 'em', subjectLabel: 'Engineering & Discrete Math', core: 'Linear Algebra: Matrices & Determinants', topicId: 'em-linalg', sessionNo: 1, revision: 'Engineering & Discrete Math (Earlier Topics)', revisionSubjectId: 'em', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-11-20', subjectId: 'em', subjectLabel: 'Engineering & Discrete Math', core: 'Linear Algebra: Eigenvalues, Eigenvectors, Rank', topicId: 'em-eigen', sessionNo: 1, revision: 'Engineering & Discrete Math (Earlier Topics)', revisionSubjectId: 'em', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-11-21', subjectId: 'em', subjectLabel: 'Engineering & Discrete Math', core: 'Calculus: Limits, Continuity, Maxima/Minima', topicId: 'em-calculus', sessionNo: 1, revision: 'Engineering & Discrete Math (Earlier Topics)', revisionSubjectId: 'em', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-11-22', subjectId: 'em', subjectLabel: 'Engineering & Discrete Math', core: 'Probability: Axioms, Conditional, Bayes', topicId: 'em-prob', sessionNo: 1, revision: 'Engineering & Discrete Math (Earlier Topics)', revisionSubjectId: 'em', test: 'Weekly Mini-Mock', mode: 'study' },
  { date: '2026-11-23', subjectId: 'em', subjectLabel: 'Engineering & Discrete Math', core: 'Probability: Random Variables & Uniform/Binomial', topicId: 'em-prob', sessionNo: 2, revision: 'Engineering & Discrete Math (Earlier Topics)', revisionSubjectId: 'em', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-11-24', subjectId: 'em', subjectLabel: 'Engineering & Discrete Math', core: 'Probability: Poisson & Normal, Stats', topicId: 'em-prob', sessionNo: 3, revision: 'Engineering & Discrete Math (Earlier Topics)', revisionSubjectId: 'em', test: 'Subject-Wise Test', mode: 'study' },
  { date: '2026-11-25', subjectId: 'pds', subjectLabel: 'Programming & Data Structures', core: 'C Programming: Data types, Operators, Control Flow', topicId: 'pds-scope', sessionNo: 1, revision: 'Engineering & Discrete Math', revisionSubjectId: 'em', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-11-26', subjectId: 'pds', subjectLabel: 'Programming & Data Structures', core: 'C Programming: Pointers, Arrays, Pointer Arithmetic', topicId: 'pds-pointers', sessionNo: 1, revision: 'Engineering & Discrete Math', revisionSubjectId: 'em', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-11-27', subjectId: 'pds', subjectLabel: 'Programming & Data Structures', core: 'C Programming: Functions, Recursion, Scoping', topicId: 'pds-pointers', sessionNo: 2, revision: 'Programming & Data Structures (Earlier Topics)', revisionSubjectId: 'pds', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-11-28', subjectId: 'pds', subjectLabel: 'Programming & Data Structures', core: 'Data Structures: Stacks and Queues', topicId: 'pds-stackqueue', sessionNo: 1, revision: 'Programming & Data Structures (Earlier Topics)', revisionSubjectId: 'pds', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-11-29', subjectId: 'pds', subjectLabel: 'Programming & Data Structures', core: 'Data Structures: Linked Lists', topicId: 'pds-list', sessionNo: 1, revision: 'Programming & Data Structures (Earlier Topics)', revisionSubjectId: 'pds', test: 'Weekly Mini-Mock', mode: 'study' },
  { date: '2026-11-30', subjectId: 'pds', subjectLabel: 'Programming & Data Structures', core: 'Trees: Binary Trees & Traversals', topicId: 'pds-trees', sessionNo: 1, revision: 'Programming & Data Structures (Earlier Topics)', revisionSubjectId: 'pds', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-01', subjectId: 'pds', subjectLabel: 'Programming & Data Structures', core: 'Trees: BSTs & AVL Trees', topicId: 'pds-bst', sessionNo: 1, revision: 'Programming & Data Structures (Earlier Topics)', revisionSubjectId: 'pds', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-02', subjectId: 'pds', subjectLabel: 'Programming & Data Structures', core: 'Heaps: Binary Heaps & Priority Queues', topicId: 'pds-heaps', sessionNo: 1, revision: 'Programming & Data Structures (Earlier Topics)', revisionSubjectId: 'pds', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-03', subjectId: 'pds', subjectLabel: 'Programming & Data Structures', core: 'Hashing: Functions & Collision Resolution', topicId: 'pds-hash', sessionNo: 1, revision: 'Programming & Data Structures (Earlier Topics)', revisionSubjectId: 'pds', test: 'Subject-Wise Test', mode: 'study' },
  { date: '2026-12-04', subjectId: 'algo', subjectLabel: 'Algorithms', core: 'Asymptotic Analysis: Big-O, Master Theorem', topicId: 'algo-asym', sessionNo: 1, revision: 'Programming & Data Structures', revisionSubjectId: 'pds', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-05', subjectId: 'algo', subjectLabel: 'Algorithms', core: 'Divide and Conquer: Merge & Quick Sort', topicId: 'algo-dc', sessionNo: 1, revision: 'Programming & Data Structures', revisionSubjectId: 'pds', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-06', subjectId: 'algo', subjectLabel: 'Algorithms', core: 'Graph Algos: BFS, DFS, Topological Sort', topicId: 'algo-graph', sessionNo: 1, revision: 'Algorithms (Earlier Topics)', revisionSubjectId: 'algo', test: 'Weekly Mini-Mock', mode: 'study' },
  { date: '2026-12-07', subjectId: 'algo', subjectLabel: 'Algorithms', core: 'Graph Algos: Shortest Paths (Dijkstra, Bellman-Ford)', topicId: 'algo-sp', sessionNo: 1, revision: 'Algorithms (Earlier Topics)', revisionSubjectId: 'algo', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-08', subjectId: 'algo', subjectLabel: 'Algorithms', core: 'Graph Algos: MSTs (Prim, Kruskal)', topicId: 'algo-mst', sessionNo: 1, revision: 'Algorithms (Earlier Topics)', revisionSubjectId: 'algo', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-09', subjectId: 'algo', subjectLabel: 'Algorithms', core: 'Dynamic Programming & Greedy Algorithms', topicId: 'algo-dp', sessionNo: 1, revision: 'Algorithms (Earlier Topics)', revisionSubjectId: 'algo', test: 'Subject-Wise Test', mode: 'study' },
  { date: '2026-12-10', subjectId: 'os', subjectLabel: 'Operating Systems', core: 'OS Basics & System Calls', topicId: 'os-process', sessionNo: 1, revision: 'Algorithms', revisionSubjectId: 'algo', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-11', subjectId: 'os', subjectLabel: 'Operating Systems', core: 'Process Management & CPU Scheduling', topicId: 'os-process', sessionNo: 2, revision: 'Algorithms', revisionSubjectId: 'algo', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-12', subjectId: 'os', subjectLabel: 'Operating Systems', core: 'Process Synchronization: Critical Section', topicId: 'os-sync', sessionNo: 1, revision: 'Operating Systems (Earlier Topics)', revisionSubjectId: 'os', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-13', subjectId: 'os', subjectLabel: 'Operating Systems', core: 'Process Synchronization: Semaphores', topicId: 'os-sync', sessionNo: 2, revision: 'Operating Systems (Earlier Topics)', revisionSubjectId: 'os', test: 'Weekly Mini-Mock', mode: 'study' },
  { date: '2026-12-14', subjectId: 'os', subjectLabel: 'Operating Systems', core: "Deadlocks: Coffman, Banker's Algorithm", topicId: 'os-deadlock', sessionNo: 1, revision: 'Operating Systems (Earlier Topics)', revisionSubjectId: 'os', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-15', subjectId: 'os', subjectLabel: 'Operating Systems', core: 'Memory Management: Paging, TLB', topicId: 'os-vm', sessionNo: 1, revision: 'Operating Systems (Earlier Topics)', revisionSubjectId: 'os', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-16', subjectId: 'os', subjectLabel: 'Operating Systems', core: 'Virtual Memory & Page Replacement', topicId: 'os-replace', sessionNo: 1, revision: 'Operating Systems (Earlier Topics)', revisionSubjectId: 'os', test: 'Subject-Wise Test', mode: 'study' },
  { date: '2026-12-17', subjectId: 'dbms', subjectLabel: 'Databases', core: 'ER Models & Relational Model', topicId: 'dbms-er', sessionNo: 1, revision: 'Operating Systems', revisionSubjectId: 'os', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-18', subjectId: 'dbms', subjectLabel: 'Databases', core: 'Relational Algebra & Tuple Relational Calculus', topicId: 'dbms-ra', sessionNo: 1, revision: 'Operating Systems', revisionSubjectId: 'os', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-19', subjectId: 'dbms', subjectLabel: 'Databases', core: 'SQL Queries (Nested, Joins, Grouping)', topicId: 'dbms-sql', sessionNo: 1, revision: 'Databases (Earlier Topics)', revisionSubjectId: 'dbms', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-20', subjectId: 'dbms', subjectLabel: 'Databases', core: 'Functional Dependencies & Attribute Closures', topicId: 'dbms-fd', sessionNo: 1, revision: 'Databases (Earlier Topics)', revisionSubjectId: 'dbms', test: 'Weekly Mini-Mock', mode: 'study' },
  { date: '2026-12-21', subjectId: 'dbms', subjectLabel: 'Databases', core: 'Normalization (1NF to BCNF)', topicId: 'dbms-norm', sessionNo: 1, revision: 'Databases (Earlier Topics)', revisionSubjectId: 'dbms', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-22', subjectId: 'dbms', subjectLabel: 'Databases', core: 'Transactions & Concurrency Control', topicId: 'dbms-txn', sessionNo: 1, revision: 'Databases (Earlier Topics)', revisionSubjectId: 'dbms', test: 'Subject-Wise Test', mode: 'study' },
  { date: '2026-12-23', subjectId: 'cn', subjectLabel: 'Computer Networks', core: 'Network Basics, OSI & TCP/IP', topicId: 'cn-delay', sessionNo: 1, revision: 'Databases', revisionSubjectId: 'dbms', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-24', subjectId: 'cn', subjectLabel: 'Computer Networks', core: 'Data Link Layer: Framing, CRC', topicId: 'cn-dll', sessionNo: 1, revision: 'Databases', revisionSubjectId: 'dbms', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-25', subjectId: 'cn', subjectLabel: 'Computer Networks', core: 'Data Link Layer: Flow Control, CSMA/CD', topicId: 'cn-dll', sessionNo: 2, revision: 'Computer Networks (Earlier Topics)', revisionSubjectId: 'cn', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-26', subjectId: 'cn', subjectLabel: 'Computer Networks', core: 'Network Layer: IPv4, Subnetting, CIDR', topicId: 'cn-ip', sessionNo: 1, revision: 'Computer Networks (Earlier Topics)', revisionSubjectId: 'cn', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-27', subjectId: 'cn', subjectLabel: 'Computer Networks', core: 'Network Layer: Routing (Distance Vector, Link State)', topicId: 'cn-ip', sessionNo: 2, revision: 'Computer Networks (Earlier Topics)', revisionSubjectId: 'cn', test: 'Weekly Mini-Mock', mode: 'study' },
  { date: '2026-12-28', subjectId: 'cn', subjectLabel: 'Computer Networks', core: 'Transport Layer: TCP Header, 3-Way Handshake', topicId: 'cn-tcp', sessionNo: 1, revision: 'Computer Networks (Earlier Topics)', revisionSubjectId: 'cn', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-29', subjectId: 'cn', subjectLabel: 'Computer Networks', core: 'Transport Layer: Congestion Control, App Layer', topicId: 'cn-tcp', sessionNo: 2, revision: 'Computer Networks (Earlier Topics)', revisionSubjectId: 'cn', test: 'Subject-Wise Test', mode: 'study' },
  { date: '2026-12-30', subjectId: 'coa', subjectLabel: 'Comp Org & Architecture', core: 'Machine Instructions & Addressing Modes', topicId: 'coa-isa', sessionNo: 1, revision: 'Computer Networks', revisionSubjectId: 'cn', test: 'Daily Validation Test', mode: 'study' },
  { date: '2026-12-31', subjectId: 'coa', subjectLabel: 'Comp Org & Architecture', core: 'ALU, Data Path, Control Unit', topicId: 'coa-isa', sessionNo: 2, revision: 'Computer Networks', revisionSubjectId: 'cn', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-01', subjectId: 'coa', subjectLabel: 'Comp Org & Architecture', core: 'Instruction Pipelining Basics', topicId: 'coa-pipeline', sessionNo: 1, revision: 'Comp Org & Architecture (Earlier Topics)', revisionSubjectId: 'coa', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-02', subjectId: 'coa', subjectLabel: 'Comp Org & Architecture', core: 'Pipeline Hazards & Speedup Math', topicId: 'coa-pipeline', sessionNo: 2, revision: 'Comp Org & Architecture (Earlier Topics)', revisionSubjectId: 'coa', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-03', subjectId: 'coa', subjectLabel: 'Comp Org & Architecture', core: 'Memory Hierarchy & Cache Basics', topicId: 'coa-cache', sessionNo: 1, revision: 'Comp Org & Architecture (Earlier Topics)', revisionSubjectId: 'coa', test: 'Weekly Mini-Mock', mode: 'study' },
  { date: '2027-01-04', subjectId: 'coa', subjectLabel: 'Comp Org & Architecture', core: 'Cache Mapping (Direct, Set-Assoc)', topicId: 'coa-cache', sessionNo: 2, revision: 'Comp Org & Architecture (Earlier Topics)', revisionSubjectId: 'coa', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-05', subjectId: 'coa', subjectLabel: 'Comp Org & Architecture', core: 'Cache Miss/Hit Ratios, Write Policies', topicId: 'coa-cacheperf', sessionNo: 1, revision: 'Comp Org & Architecture (Earlier Topics)', revisionSubjectId: 'coa', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-06', subjectId: 'coa', subjectLabel: 'Comp Org & Architecture', core: 'I/O Interface, Interrupts, DMA', topicId: 'coa-isa', sessionNo: 3, revision: 'Comp Org & Architecture (Earlier Topics)', revisionSubjectId: 'coa', test: 'Subject-Wise Test', mode: 'study' },
  { date: '2027-01-07', subjectId: 'dl', subjectLabel: 'Digital Logic', core: 'Boolean Algebra, Logic Gates, K-Maps', topicId: 'dl-bool', sessionNo: 1, revision: 'Comp Org & Architecture', revisionSubjectId: 'coa', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-08', subjectId: 'dl', subjectLabel: 'Digital Logic', core: 'Number Systems & Arithmetic', topicId: 'dl-num', sessionNo: 1, revision: 'Comp Org & Architecture', revisionSubjectId: 'coa', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-09', subjectId: 'dl', subjectLabel: 'Digital Logic', core: 'Combinational Circuits: MUX, Decoders, Adders', topicId: 'dl-comb', sessionNo: 1, revision: 'Digital Logic (Earlier Topics)', revisionSubjectId: 'dl', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-10', subjectId: 'dl', subjectLabel: 'Digital Logic', core: 'Sequential Circuits: Latches & Flip-Flops', topicId: 'dl-seq', sessionNo: 1, revision: 'Digital Logic (Earlier Topics)', revisionSubjectId: 'dl', test: 'Weekly Mini-Mock', mode: 'study' },
  { date: '2027-01-11', subjectId: 'dl', subjectLabel: 'Digital Logic', core: 'Sequential Circuits: Synchronous Counters', topicId: 'dl-seq', sessionNo: 2, revision: 'Digital Logic (Earlier Topics)', revisionSubjectId: 'dl', test: 'Subject-Wise Test', mode: 'study' },
  { date: '2027-01-12', subjectId: 'toc', subjectLabel: 'Theory of Computation', core: 'Finite Automata (DFA, NFA)', topicId: 'toc-fa', sessionNo: 1, revision: 'Digital Logic', revisionSubjectId: 'dl', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-13', subjectId: 'toc', subjectLabel: 'Theory of Computation', core: 'Regular Expressions & FA Equivalence', topicId: 'toc-min', sessionNo: 1, revision: 'Digital Logic', revisionSubjectId: 'dl', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-14', subjectId: 'toc', subjectLabel: 'Theory of Computation', core: 'Regular Languages: Pumping Lemma, Closure', topicId: 'toc-min', sessionNo: 2, revision: 'Theory of Computation (Earlier Topics)', revisionSubjectId: 'toc', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-15', subjectId: 'toc', subjectLabel: 'Theory of Computation', core: 'CFGs & Pushdown Automata', topicId: 'toc-cfg', sessionNo: 1, revision: 'Theory of Computation (Earlier Topics)', revisionSubjectId: 'toc', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-16', subjectId: 'toc', subjectLabel: 'Theory of Computation', core: 'Context-Free Languages: Ambiguity, Closure', topicId: 'toc-pda', sessionNo: 1, revision: 'Theory of Computation (Earlier Topics)', revisionSubjectId: 'toc', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-17', subjectId: 'toc', subjectLabel: 'Theory of Computation', core: 'Turing Machines & Recursively Enumerable', topicId: 'toc-tm', sessionNo: 1, revision: 'Theory of Computation (Earlier Topics)', revisionSubjectId: 'toc', test: 'Weekly Mini-Mock', mode: 'study' },
  { date: '2027-01-18', subjectId: 'toc', subjectLabel: 'Theory of Computation', core: 'Decidability & Halting Problem', topicId: 'toc-tm', sessionNo: 2, revision: 'Theory of Computation (Earlier Topics)', revisionSubjectId: 'toc', test: 'Subject-Wise Test', mode: 'study' },
  { date: '2027-01-19', subjectId: 'cd', subjectLabel: 'Compiler Design', core: 'Lexical Analysis & Tokenization', topicId: 'cd-lex', sessionNo: 1, revision: 'Theory of Computation', revisionSubjectId: 'toc', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-20', subjectId: 'cd', subjectLabel: 'Compiler Design', core: 'Syntax Analysis: Top-Down (LL1)', topicId: 'cd-ll', sessionNo: 1, revision: 'Theory of Computation', revisionSubjectId: 'toc', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-21', subjectId: 'cd', subjectLabel: 'Compiler Design', core: 'Syntax Analysis: Bottom-Up (LR, SLR)', topicId: 'cd-lr', sessionNo: 1, revision: 'Compiler Design (Earlier Topics)', revisionSubjectId: 'cd', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-22', subjectId: 'cd', subjectLabel: 'Compiler Design', core: 'Syntax-Directed Translation (SDT)', topicId: 'cd-opt', sessionNo: 1, revision: 'Compiler Design (Earlier Topics)', revisionSubjectId: 'cd', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-23', subjectId: 'cd', subjectLabel: 'Compiler Design', core: 'Intermediate Code & Optimization', topicId: 'cd-opt', sessionNo: 2, revision: 'Compiler Design (Earlier Topics)', revisionSubjectId: 'cd', test: 'Subject-Wise Test', mode: 'study' },
  { date: '2027-01-24', subjectId: 'ga', subjectLabel: 'General Aptitude', core: 'Quantitative: Percentages, Profit/Loss', topicId: 'ga-arith', sessionNo: 1, revision: 'Compiler Design', revisionSubjectId: 'cd', test: 'Weekly Mini-Mock', mode: 'study' },
  { date: '2027-01-25', subjectId: 'ga', subjectLabel: 'General Aptitude', core: 'Quantitative: Time, Work, Distance', topicId: 'ga-arith', sessionNo: 2, revision: 'Compiler Design', revisionSubjectId: 'cd', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-26', subjectId: 'ga', subjectLabel: 'General Aptitude', core: 'Spatial: 2D/3D Folding, Patterns', topicId: 'ga-spatial', sessionNo: 1, revision: 'General Aptitude (Earlier Topics)', revisionSubjectId: 'ga', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-27', subjectId: 'ga', subjectLabel: 'General Aptitude', core: 'Analytical: Deductive Logic, Syllogisms', topicId: 'ga-logic', sessionNo: 1, revision: 'General Aptitude (Earlier Topics)', revisionSubjectId: 'ga', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-28', subjectId: 'ga', subjectLabel: 'General Aptitude', core: 'Verbal: Grammar & Vocabulary', topicId: 'ga-verbal', sessionNo: 1, revision: 'General Aptitude (Earlier Topics)', revisionSubjectId: 'ga', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-29', subjectId: 'ga', subjectLabel: 'General Aptitude', core: 'Verbal: Reading Comprehension', topicId: 'ga-rc', sessionNo: 1, revision: 'General Aptitude (Earlier Topics)', revisionSubjectId: 'ga', test: 'Daily Validation Test', mode: 'study' },
  { date: '2027-01-30', subjectId: 'ga', subjectLabel: 'General Aptitude', core: 'Data Interpretation & Functional Graphs', topicId: 'ga-di', sessionNo: 1, revision: 'General Aptitude (Earlier Topics)', revisionSubjectId: 'ga', test: 'Subject-Wise Test', mode: 'study' },
  { date: '2027-01-31', subjectLabel: 'Full Mocks & Revision', core: 'Full-Length Mock Exam 1 + Thorough Analysis', revision: 'General Aptitude', revisionSubjectId: 'ga', test: 'Full Length Mock', mode: 'mock', mockNo: 1 },
  { date: '2027-02-01', subjectLabel: 'Full Mocks & Revision', core: 'Full-Length Mock Exam 2 + Weak Area Revision', revision: 'General Aptitude', revisionSubjectId: 'ga', test: 'Full Length Mock', mode: 'mock', mockNo: 2 },
  { date: '2027-02-02', subjectLabel: 'Full Mocks & Revision', core: 'Full-Length Mock Exam 3 + Thorough Analysis', revision: 'Full Mocks & Revision (Earlier Topics)', test: 'Full Length Mock', mode: 'mock', mockNo: 3 },
  { date: '2027-02-03', subjectLabel: 'Full Mocks & Revision', core: 'Full-Length Mock Exam 4 + Weak Area Revision', revision: 'Full Mocks & Revision (Earlier Topics)', test: 'Full Length Mock', mode: 'mock', mockNo: 4 },
  { date: '2027-02-04', subjectLabel: 'Full Mocks & Revision', core: 'Full-Length Mock Exam 5 + Thorough Analysis', revision: 'Full Mocks & Revision (Earlier Topics)', test: 'Full Length Mock', mode: 'mock', mockNo: 5 },
  { date: '2027-02-05', subjectLabel: 'Full Mocks & Revision', core: 'Final Formula Revision (No Testing)', revision: 'Full Mocks & Revision (Earlier Topics)', test: 'Full Length Mock', mode: 'revision' },
  { date: '2027-02-06', subjectLabel: 'Full Mocks & Revision', core: 'Rest & Mental Prep (Eve of Exam)', revision: 'Full Mocks & Revision (Earlier Topics)', test: 'Full Length Mock', mode: 'rest' },
];

export const PLAN_BY_DATE = new Map(STUDY_PLAN.map((day) => [day.date, day]));

export function planForDate(date: string): PlanDay | undefined {
  return PLAN_BY_DATE.get(date);
}

export function studyFlowForDate(date: string): FlowStudyBlock[] {
  const plan = planForDate(date);
  if (plan?.mode === 'mock') return MOCK_STUDY_FLOW(plan.mockNo ?? 1);
  if (plan?.mode === 'revision') return REVISION_STUDY_FLOW;
  if (plan?.mode === 'rest') return REST_STUDY_FLOW;
  return DEFAULT_STUDY_FLOW;
}

export function isFlowDate(date: string): boolean {
  return PLAN_BY_DATE.has(date);
}

export function flowStudyMinutes(): number {
  return DEFAULT_STUDY_FLOW.reduce((sum, block) => sum + block.duration, 0);
}
