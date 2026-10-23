// 角色导入：确定性解析（不调用 AI），支持 json 和 txt 两种模板。
// 两个解析函数都返回同一个"可直接铺进 CharacterEditor 表单"的对象：
// { name, bio, extraNotes, userPersona, statusList, worldBookEntries, knowledgeEntries }
// 世界书/知识库条目统一补上 { id, isEnabled: true }（模板里不收录 isEnabled，导入一律按启用处理）。

const TOP_LEVEL_TAGS = ['姓名', '简介', '补充说明', '我的人设', '待机状态', '世界书', '知识库'];

const makeEmptyResult = () => ({
  name: '',
  bio: '',
  extraNotes: '',
  userPersona: '',
  statusList: [],
  worldBookEntries: [],
  knowledgeEntries: [],
});

let idSeed = 0;
const nextId = () => Date.now() + (idSeed++);

// ---------- JSON 模板 ----------

export function parseCharacterImportJson(rawText) {
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (err) {
    throw new Error('JSON 格式有误，无法解析：' + err.message);
  }

  if (data.format && data.format !== 'wiwu-character-v1') {
    // 版本不认识也不报错，只是先按现有字段尝试读取，交给导入预览去提醒用户。
    console.warn('[characterImport] 未知的模板 format：', data.format);
  }

  const result = makeEmptyResult();
  result.name = typeof data.name === 'string' ? data.name.trim() : '';
  result.bio = typeof data.bio === 'string' ? data.bio.trim() : '';
  result.extraNotes = typeof data.extraNotes === 'string' ? data.extraNotes.trim() : '';
  result.userPersona = typeof data.userPersona === 'string' ? data.userPersona.trim() : '';

  result.statusList = Array.isArray(data.statusList)
    ? data.statusList.map((s) => String(s).trim()).filter(Boolean)
    : [];

  result.worldBookEntries = normalizeEntryArray(data.worldBookEntries);
  result.knowledgeEntries = normalizeEntryArray(data.knowledgeEntries);

  return result;
}

function normalizeEntryArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((e) => ({
      id: nextId(),
      title: typeof e?.title === 'string' ? e.title.trim() : '',
      content: typeof e?.content === 'string' ? e.content.trim() : '',
      isEnabled: true,
    }))
    .filter((e) => e.title || e.content);
}

// ---------- TXT 模板 ----------

export function parseCharacterImportTxt(rawText) {
  const text = rawText.replace(/\r\n/g, '\n');
  const lines = text.split('\n');

  // 找出所有顶层标签行的位置（整行 trim 后严格等于【标签】）
  const marks = [];
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const match = trimmed.match(/^【(.+)】$/);
    if (match && TOP_LEVEL_TAGS.includes(match[1])) {
      marks.push({ tag: match[1], lineIdx: idx });
    }
  });

  const sections = {};
  marks.forEach((mark, i) => {
    const start = mark.lineIdx + 1;
    const end = i + 1 < marks.length ? marks[i + 1].lineIdx : lines.length;
    sections[mark.tag] = lines.slice(start, end).join('\n').trim();
  });

  const result = makeEmptyResult();
  result.name = sections['姓名'] || '';
  result.bio = sections['简介'] || '';
  result.extraNotes = sections['补充说明'] || '';
  result.userPersona = sections['我的人设'] || '';

  result.statusList = (sections['待机状态'] || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^（.*）$/.test(l)); // 过滤掉模板里的括号提示行

  result.worldBookEntries = parseEntrySection(sections['世界书'] || '');
  result.knowledgeEntries = parseEntrySection(sections['知识库'] || '');

  return result;
}

// 解析世界书/知识库内部的 【条目】【内容】 重复块
function parseEntrySection(sectionText) {
  if (!sectionText.trim()) return [];

  const lines = sectionText.split('\n');
  const entryStarts = [];
  lines.forEach((line, idx) => {
    if (line.trim() === '【条目】' || /^【条目】/.test(line.trim())) {
      entryStarts.push(idx);
    }
  });

  if (entryStarts.length === 0) return [];

  const entries = [];
  entryStarts.forEach((startIdx, i) => {
    const endIdx = i + 1 < entryStarts.length ? entryStarts[i + 1] : lines.length;
    const block = lines.slice(startIdx, endIdx);

    // 第一行可能是「【条目】」或「【条目】标题写在同一行」
    const firstLine = block[0].trim();
    const inlineTitle = firstLine.replace(/^【条目】/, '').trim();

    const contentLineIdx = block.findIndex((l) => l.trim() === '【内容】' || /^【内容】/.test(l.trim()));

    let title = inlineTitle;
    let content = '';

    if (contentLineIdx === -1) {
      // 没写【内容】标签，整块（除第一行外）都当标题/正文处理不了，跳过无效块
      return;
    }

    // 标题：第一行内联部分 + 【条目】和【内容】之间的其它行（通常没有）
    const betweenLines = block.slice(1, contentLineIdx).map((l) => l.trim()).filter(Boolean);
    title = [inlineTitle, ...betweenLines].filter(Boolean).join(' ').trim();

    // 正文：【内容】行自身可能有内联文字 + 之后所有行
    const contentFirstLine = block[contentLineIdx].trim().replace(/^【内容】/, '').trim();
    const restContentLines = block.slice(contentLineIdx + 1);
    content = [contentFirstLine, ...restContentLines].join('\n').trim();

    if (title || content) {
      entries.push({ id: nextId(), title, content, isEnabled: true });
    }
  });

  return entries;
}