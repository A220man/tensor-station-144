/**
 * PR Review Canvas - Diff Renderer
 * 
 * Fixed version addressing issue #472:
 * - Import filtering and whitespace collapsing happen AFTER line numbering
 * - Filters are opt-in and visibly marked
 * - Whitespace-sensitive file types are excluded from whitespace collapsing
 */

export function parseDiff(diffText) {
  const hunks = [];
  const lines = diffText.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const hunkMatch = line.match(/^@@\s+-(\d+),?(\d*)\s+\+(\d+),?(\d*)\s+@@/);
    
    if (hunkMatch) {
      const oldStart = parseInt(hunkMatch[1], 10);
      const oldCount = hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1;
      const newStart = parseInt(hunkMatch[3], 10);
      const newCount = hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1;
      
      const hunk = {
        header: line,
        oldStart,
        oldCount,
        newStart,
        newCount,
        lines: []
      };
      
      i++;
      let oldLineNum = oldStart;
      let newLineNum = newStart;
      
      while (i < lines.length && !lines[i].match(/^@@\s+-\d+/)) {
        const content = lines[i];
        let type = 'context';
        let oldNum = null;
        let newNum = null;
        
        if (content.startsWith('-')) {
          type = 'delete';
          oldNum = oldLineNum++;
        } else if (content.startsWith('+')) {
          type = 'add';
          newNum = newLineNum++;
        } else {
          type = 'context';
          oldNum = oldLineNum++;
          newNum = newLineNum++;
        }
        
        hunk.lines.push({
          type,
          content: content.slice(1),
          oldLineNum: oldNum,
          newLineNum: newNum,
          originalLine: content
        });
        
        i++;
      }
      
      hunks.push(hunk);
    } else {
      i++;
    }
  }
  
  return hunks;
}

export function isImport(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('import ') || 
         trimmed.startsWith('import{') || 
         trimmed.startsWith('} from ') ||
         trimmed.match(/^import\s+.*\s+from\s+['"]/);
}

export function isWhitespaceOnlyChange(oldLine, newLine) {
  // Compare after trimming leading/trailing whitespace only (not internal)
  const oldTrimmed = oldLine.trim();
  const newTrimmed = newLine.trim();
  return oldTrimmed === newTrimmed && oldLine !== newLine;
}

export function isWhitespaceSensitiveFile(filename) {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  const ext = lower.split('.').pop();
  // Check for files without extension like Makefile, Dockerfile
  if (lower === 'makefile' || lower === 'dockerfile') return true;
  return ['py', 'yaml', 'yml', 'make', 'mk', 'dockerfile'].includes(ext);
}

export function applyFilters(hunks, options = {}) {
  const {
    filterImports = false,
    collapseWhitespace = true,
    filename = null
  } = options;
  
  const isWsSensitive = isWhitespaceSensitiveFile(filename);
  const filteredHunks = [];
  let totalFilteredImports = 0;
  let totalCollapsedWhitespace = 0;
  
  for (const hunk of hunks) {
    const filteredLines = [];
    let filteredImports = 0;
    let collapsedWhitespace = 0;
    
    for (let i = 0; i < hunk.lines.length; i++) {
      const line = hunk.lines[i];
      let skipPush = false;
      
      // Check for import filtering (opt-in)
      if (filterImports && isImport(line.content)) {
        filteredImports++;
        continue;
      }
      
      // Check for whitespace-only collapsing (opt-in, not for whitespace-sensitive files)
      if (collapseWhitespace && !isWsSensitive && line.type === 'delete') {
        // Look ahead for matching add line
        for (let j = i + 1; j < hunk.lines.length; j++) {
          const nextLine = hunk.lines[j];
          if (nextLine.type === 'add' && isWhitespaceOnlyChange(line.content, nextLine.content)) {
            // Collapse both into a single context line showing the trimmed version
            filteredLines.push({
              type: 'context',
              content: line.content.trim(),
              oldLineNum: line.oldLineNum,
              newLineNum: nextLine.newLineNum,
              originalLine: ' ' + line.content.trim(),
              collapsed: true,
              collapseType: 'whitespace'
            });
            collapsedWhitespace += 2;
            i = j; // Skip the add line
            skipPush = true;
            break;
          } else if (nextLine.type !== 'context') {
            break;
          }
        }
      }
      
      if (!skipPush && i < hunk.lines.length) {
        filteredLines.push(line);
      }
    }
    
    if (filteredImports > 0) {
      totalFilteredImports += filteredImports;
      // Add a collapsed marker line at the beginning of the hunk
      filteredLines.unshift({
        type: 'filter-marker',
        content: `${filteredImports} import line${filteredImports > 1 ? 's' : ''} hidden`,
        filterType: 'import',
        count: filteredImports,
        collapsible: true,
        expanded: false
      });
    }
    
    if (collapsedWhitespace > 0) {
      totalCollapsedWhitespace += collapsedWhitespace;
    }
    
    filteredHunks.push({
      ...hunk,
      lines: filteredLines,
      filteredImports,
      collapsedWhitespace
    });
  }
  
  return {
    hunks: filteredHunks,
    stats: {
      totalFilteredImports,
      totalCollapsedWhitespace
    }
  };
}

export function renderDiff(diffText, options = {}) {
  const hunks = parseDiff(diffText);
  const { hunks: filteredHunks, stats } = applyFilters(hunks, options);
  
  return {
    hunks: filteredHunks,
    stats,
    options
  };
}

export function renderToHtml(renderedDiff) {
  let html = '<div class="pr-review-canvas">';
  
  for (const hunk of renderedDiff.hunks) {
    html += `<div class="diff-hunk" data-old-start="${hunk.oldStart}" data-new-start="${hunk.newStart}">`;
    html += `<div class="hunk-header">${escapeHtml(hunk.header)}</div>`;
    html += '<table class="diff-table"><tbody>';
    
    for (const line of hunk.lines) {
      if (line.type === 'filter-marker') {
        html += `<tr class="filter-marker ${line.expanded ? 'expanded' : 'collapsed'}" data-filter-type="${line.filterType}" data-count="${line.count}">`;
        html += `<td class="line-num old"></td><td class="line-num new"></td>`;
        html += `<td class="filter-content" colspan="2">`;
        html += `<span class="filter-toggle">${line.expanded ? '▼' : '▶'}</span> `;
        html += `<span class="filter-text">${escapeHtml(line.content)}</span>`;
        html += `</td></tr>`;
        continue;
      }
      
      const oldNum = line.oldLineNum !== null ? line.oldLineNum : '';
      const newNum = line.newLineNum !== null ? line.newLineNum : '';
      const lineClass = `diff-line diff-${line.type}${line.collapsed ? ' collapsed' : ''}`;
      
      html += `<tr class="${lineClass}">`;
      html += `<td class="line-num old">${escapeHtml(String(oldNum))}</td>`;
      html += `<td class="line-num new">${escapeHtml(String(newNum))}</td>`;
      html += `<td class="line-content">${escapeHtml(line.content)}</td>`;
      html += `</tr>`;
    }
    
    html += '</tbody></table></div>';
  }
  
  html += '</div>';
  return html;
}

export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
