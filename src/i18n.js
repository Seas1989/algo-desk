/**
 * i18n.js — 英文术语 → 中文
 * 覆盖 Codeforces 算法标签、段位、评测结果。
 * 约定：查不到的值原样返回（不翻译、不留空白），避免漏项时页面出现空洞。
 */

// CF problemset 算法标签（含常见别名与官方全称）
export const TAG_CN = {
  '3d': '三维几何',
  '2-sat': '2-SAT',
  'binary search': '二分查找',
  'bitmasks': '位掩码',
  'brute force': '暴力枚举',
  'chinese remainder theorem': '中国剩余定理',
  'combinatorics': '组合计数',
  'constructive algorithms': '构造算法',
  'data structures': '数据结构',
  'dfs and similar': 'DFS 及类似',
  'diophantine': '丢番图方程',
  'divide and conquer': '分治',
  'dsu': '并查集',
  'expressions': '表达式',
  'fft': '快速傅里叶变换',
  'flows': '网络流',
  'games': '博弈',
  'game theory': '博弈论',
  'gaussian elimination': '高斯消元',
  'general mathematics': '普通数学',
  'geometry': '几何',
  'graphs': '图论',
  'greedy': '贪心',
  'hash functions': '哈希函数',
  'hashing': '哈希',
  'interactive': '交互',
  'intervals': '区间',
  'java': 'Java',
  'knapsack': '背包',
  'lazy propagation': '懒标记',
  'lexicographic rules': '字典序',
  'line sweep': '扫描线',
  'math': '数学',
  'matrices': '矩阵',
  'memoization': '记忆化',
  'number theory': '数论',
  'plans': '模拟',
  'probabilities': '概率',
  'problem of the day 2024': '每日一题',
  'programming': '编程',
  'regular expressions': '正则表达式',
  'schedules': '调度',
  'search queries on trees': '树上询问',
  'shortest paths': '最短路',
  'sieving': '筛法',
  'sortings': '排序',
  'stacks': '栈',
  'stochastic': '随机化',
  'strings': '字符串',
  'suffix automaton': '后缀自动机',
  'suffix structures': '后缀结构',
  'string suffix structures': '字符串后缀结构',
  'ternary search': '三分查找',
  'tree of cycles': '基环树',
  'trees': '树',
  'two pointers': '双指针',
  'dp': '动态规划',
  'dp bitmasks': '状压 DP',
  'dp knapsack': '背包 DP',
  'dp matrices': '矩阵 DP',
  'dp math': '数学 DP',
  'dp probabilities': '概率 DP',
  'arrays': '数组',
  'implementation': '实现',
};

// CF 段位
export const RANK_CN = {
  newbie: '新手',
  pupil: '入门',
  specialist: '专家',
  expert: '能手',
  'candidate master': '候补大师',
  master: '大师',
  'international master': '国际大师',
  grandmaster: '特级大师',
  'international grandmaster': '国际特级大师',
  'legendary grandmaster': '传说大师',
  unranked: '未定级',
};

// 评测结果（短标签，页面上直接显示，绝不留英文）
export const VERDICT_CN = {
  OK: '通过',
  WA: '答案错误',
  TLE: '超时',
  MLE: '超内存',
  RE: '运行出错',
  CE: '编译错误',
  ILE: '交互超时',
  OLE: '输出超限',
  FE: '格式错误',
  PC: '部分正确',
  部分分: '部分分',
  跳过: '跳过',
  // 兼容未被 fetch 脚本压缩过的完整枚举
  WRONG_ANSWER: '答案错误',
  TIME_LIMIT_EXCEEDED: '超时',
  MEMORY_LIMIT_EXCEEDED: '超内存',
  RUNTIME_ERROR: '运行出错',
  COMPILATION_ERROR: '编译错误',
  IDLENESS_LIMIT_EXCEEDED: '交互超时',
  OUTPUT_LIMIT_EXCEEDED: '输出超限',
  PARTIAL: '部分分',
  SKIPPED: '跳过',
};

// 评测结果完整说法（放 title 提示）
export const VERDICT_FULL = {
  OK: '通过（Accepted）',
  WA: '答案错误（Wrong Answer）',
  TLE: '超过时间限制（Time Limit Exceeded）',
  MLE: '超过内存限制（Memory Limit Exceeded）',
  RE: '运行错误（Runtime Error）',
  CE: '编译错误（Compilation Error）',
  ILE: '交互空闲超时（Idleness Limit Exceeded）',
  OLE: '输出超限（Output Limit Exceeded）',
  FE: '格式错误（Presentation Error）',
  PC: '部分正确（Partial Correct）',
  部分分: '部分分（Partial）',
  跳过: '跳过（Skipped）',
  WRONG_ANSWER: '答案错误（Wrong Answer）',
  TIME_LIMIT_EXCEEDED: '超过时间限制（Time Limit Exceeded）',
  MEMORY_LIMIT_EXCEEDED: '超过内存限制（Memory Limit Exceeded）',
  RUNTIME_ERROR: '运行错误（Runtime Error）',
  COMPILATION_ERROR: '编译错误（Compilation Error）',
  IDLENESS_LIMIT_EXCEEDED: '交互空闲超时（Idleness Limit Exceeded）',
  OUTPUT_LIMIT_EXCEEDED: '输出超限（Output Limit Exceeded）',
  PARTIAL: '部分分（Partial）',
  SKIPPED: '跳过（Skipped）',
};

const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : s);

export function tagCN(t) {
  if (t == null) return '';
  return TAG_CN[t] ?? TAG_CN[norm(t)] ?? t;
}

export function rankCN(r) {
  if (r == null) return '未定级';
  return RANK_CN[norm(r)] ?? r;
}

export function verdictCN(v) {
  if (v == null) return '';
  return VERDICT_CN[v] ?? VERDICT_CN[norm(v)] ?? v;
}

export function verdictFull(v) {
  if (v == null) return '';
  return VERDICT_FULL[v] ?? VERDICT_FULL[norm(v)] ?? v;
}
