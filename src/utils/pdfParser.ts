/**
 * Smart PDF Parser - AI-powered question extraction
 * Extracts exact questions from PDF, removes waste content
 */

interface ParsedQuestion {
  text: string;
  options: string[];
  correctAnswer: number | null;
  topic?: string;
  difficulty?: string;
}

interface ParseResult {
  questions: ParsedQuestion[];
  totalExtracted: number;
  removedContent: string[];
  warnings: string[];
  rawText: string;
}

// Waste content patterns to remove
const WASTE_PATTERNS = [
  // Page numbers
  /^page\s*\d+$/i,
  /^\d+\s*$/,
  /^-\s*\d+\s*-$/,
  /^\[\d+\]$/,
  
  // Headers/Footers
  /^name\s*[:_-]?\s*$/i,
  /^roll\s*(no\.?|number)\s*[:_-]?\s*$/i,
  /^date\s*[:_-]?\s*$/i,
  /^time\s*[:_-]?\s*$/i,
  /^class\s*[:_-]?\s*$/i,
  /^section\s*[:_-]?\s*$/i,
  /^subject\s*[:_-]?\s*$/i,
  /^total\s*marks?\s*[:_-]?\s*\d*$/i,
  /^max\.?\s*marks?\s*[:_-]?\s*\d*$/i,
  /^time\s*allowed\s*[:_-]?\s*\d*\s*(min|hour|hr)?s?$/i,
  
  // Instructions
  /^instructions?\s*[:_-]?\s*$/i,
  /^read\s+(the\s+)?(following\s+)?instructions?\s*carefully/i,
  /^attempt\s+all\s+questions?/i,
  /^all\s+questions?\s+(are\s+)?(compulsory|mandatory)/i,
  /^each\s+question\s+carries/i,
  /^do\s+not\s+write/i,
  /^write\s+your\s+(name|roll)/i,
  /^use\s+(only\s+)?(blue|black)\s*(ball\s*)?pen/i,
  /^rough\s+work/i,
  /^note\s*[:_-]/i,
  
  // School/Exam headers
  /school|college|university|academy|institute/i,
  /examination|exam\s+paper|test\s+paper|question\s+paper/i,
  /^(first|second|third|final|mid|annual)\s*(term)?\s*(exam|test)?$/i,
  /session\s*[:_-]?\s*\d{4}/i,
  /^\d{4}\s*-\s*\d{2,4}$/,
  
  // Signatures
  /^signature/i,
  /^invigilator/i,
  /^examiner/i,
  
  // Hindi headers
  /^नाम\s*[:_-]?\s*$/,
  /^अनुक्रमांक\s*[:_-]?\s*$/,
  /^रोल\s*(न[ंो]\.?|नंबर)\s*[:_-]?\s*$/,
  /^दिनांक\s*[:_-]?\s*$/,
  /^विषय\s*[:_-]?\s*$/,
  /^कक्षा\s*[:_-]?\s*$/,
  /^निर्देश\s*[:_-]?\s*$/,
  /^पूर्णांक\s*[:_-]?\s*$/,
  /^समय\s*[:_-]?\s*$/,
  
  // Empty or short lines
  /^[\s_-]+$/,
  /^\.{3,}$/,
];

// Question number patterns
const QUESTION_PATTERNS = [
  /^(\d+)\s*[\.\)]\s*(.+)/,                    // 1. Question or 1) Question
  /^Q\.?\s*(\d+)\s*[\.\):]?\s*(.+)/i,          // Q1. or Q.1) or Q1:
  /^Question\s*(\d+)\s*[\.\):]?\s*(.+)/i,      // Question 1. or Question 1:
  /^\((\d+)\)\s*(.+)/,                         // (1) Question
  /^प्रश्न\s*(\d+)\s*[\.\):]?\s*(.+)/,         // Hindi: प्रश्न 1.
  /^(\d+)\s*[\-–—]\s*(.+)/,                    // 1 - Question
];

// Option patterns
const OPTION_PATTERNS = [
  /^([A-Da-d])\s*[\.\)]\s*(.+)/,               // A. or a) option
  /^\(([A-Da-d])\)\s*(.+)/,                    // (A) option
  /^([A-Da-d])\s*[:]\s*(.+)/,                  // A: option
  /^Option\s*([A-Da-d])\s*[\.\):]\s*(.+)/i,    // Option A. or Option A:
  /^([क-घ])\s*[\.\)]\s*(.+)/,                  // Hindi: क. option
  /^\(([क-घ])\)\s*(.+)/,                       // Hindi: (क) option
];

// Correct answer patterns
const ANSWER_PATTERNS = [
  /(?:answer|ans|correct|सही\s*उत्तर)\s*[:=]?\s*([A-Da-dक-घ])/i,
  /\*\*([A-Da-d])\*\*/,                        // **A**
  /\[correct\]\s*([A-Da-d])/i,                 // [correct] A
  /([A-Da-d])\s*[\(\[]?(?:correct|✓|✔|√)[\)\]]?/i,
];

// Check if line is waste content
function isWasteContent(line: string): boolean {
  const trimmed = line.trim();
  
  // Empty or very short
  if (!trimmed || trimmed.length < 3) return true;
  
  // Check against waste patterns
  for (const pattern of WASTE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  
  // Only special characters
  if (/^[^a-zA-Z0-9\u0900-\u097F]+$/.test(trimmed)) return true;
  
  return false;
}

// Extract question number and text
function parseQuestionLine(line: string): { num: number; text: string } | null {
  const trimmed = line.trim();
  
  for (const pattern of QUESTION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        num: parseInt(match[1]) || 0,
        text: match[2].trim()
      };
    }
  }
  
  return null;
}

// Extract option letter and text
function parseOptionLine(line: string): { letter: string; text: string } | null {
  const trimmed = line.trim();
  
  for (const pattern of OPTION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const letter = match[1].toUpperCase();
      // Convert Hindi letters to English
      const hindiToEng: Record<string, string> = { 'क': 'A', 'ख': 'B', 'ग': 'C', 'घ': 'D' };
      const normalizedLetter = hindiToEng[letter] || letter;
      
      return {
        letter: normalizedLetter,
        text: match[2].trim()
      };
    }
  }
  
  return null;
}

// Extract correct answer from text
function extractAnswer(text: string): string | null {
  for (const pattern of ANSWER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const letter = match[1].toUpperCase();
      const hindiToEng: Record<string, string> = { 'क': 'A', 'ख': 'B', 'ग': 'C', 'घ': 'D' };
      return hindiToEng[letter] || letter;
    }
  }
  return null;
}

// Convert letter to index (A=0, B=1, C=2, D=3)
function letterToIndex(letter: string): number {
  return letter.charCodeAt(0) - 'A'.charCodeAt(0);
}

// Parse all options from a line (inline format)
function parseInlineOptions(line: string): string[] | null {
  // Pattern: A) opt1 B) opt2 C) opt3 D) opt4
  const inlinePattern = /([A-Da-d])\s*[\.\)]\s*([^A-Da-d\.\)]+)/gi;
  const matches = [...line.matchAll(inlinePattern)];
  
  if (matches.length >= 4) {
    const options: string[] = ['', '', '', ''];
    matches.forEach(match => {
      const idx = letterToIndex(match[1].toUpperCase());
      if (idx >= 0 && idx < 4) {
        options[idx] = match[2].trim();
      }
    });
    if (options.every(o => o.length > 0)) {
      return options;
    }
  }
  
  return null;
}

/**
 * Smart parse PDF text to extract questions
 */
export function smartParsePDF(text: string): ParseResult {
  const lines = text.split('\n');
  const questions: ParsedQuestion[] = [];
  const removedContent: string[] = [];
  const warnings: string[] = [];
  
  let currentQuestion: ParsedQuestion | null = null;
  let currentOptions: string[] = ['', '', '', ''];
  let optionCount = 0;
  // Track question lines for debugging
  const questionLines: string[] = [];
  
  console.log('🤖 AI Analyzing PDF content...');
  console.log('📄 Total lines:', lines.length);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Check if waste content
    if (isWasteContent(line)) {
      removedContent.push(line);
      continue;
    }
    
    // Try to parse as question
    const questionMatch = parseQuestionLine(line);
    if (questionMatch) {
      // Save previous question if complete
      if (currentQuestion && optionCount >= 2) {
        currentQuestion.options = [...currentOptions];
        questions.push(currentQuestion);
      }
      
      // Start new question
      currentQuestion = {
        text: questionMatch.text,
        options: ['', '', '', ''],
        correctAnswer: null
      };
      currentOptions = ['', '', '', ''];
      optionCount = 0;
      questionLines.push(line);
      
      // Check for inline options in same line
      const inlineOpts = parseInlineOptions(line);
      if (inlineOpts) {
        currentOptions = inlineOpts;
        optionCount = 4;
      }
      
      // Check for answer in question line
      const answer = extractAnswer(line);
      if (answer) {
        currentQuestion.correctAnswer = letterToIndex(answer);
      }
      
      continue;
    }
    
    // Try to parse as option
    const optionMatch = parseOptionLine(line);
    if (optionMatch && currentQuestion) {
      const idx = letterToIndex(optionMatch.letter);
      if (idx >= 0 && idx < 4) {
        currentOptions[idx] = optionMatch.text;
        optionCount++;
        
        // Check for answer marker in option
        const answer = extractAnswer(line);
        if (answer) {
          currentQuestion.correctAnswer = letterToIndex(answer);
        }
      }
      continue;
    }
    
    // Check for inline options
    const inlineOpts = parseInlineOptions(line);
    if (inlineOpts && currentQuestion) {
      currentOptions = inlineOpts;
      optionCount = 4;
      
      // Check for answer in options line
      const answer = extractAnswer(line);
      if (answer) {
        currentQuestion.correctAnswer = letterToIndex(answer);
      }
      continue;
    }
    
    // Check for standalone answer line
    const answer = extractAnswer(line);
    if (answer && currentQuestion) {
      currentQuestion.correctAnswer = letterToIndex(answer);
      continue;
    }
    
    // If we have a current question and this line might be continuation
    if (currentQuestion && optionCount === 0 && line.length > 5) {
      // This might be continuation of question text
      if (!parseQuestionLine(line) && !parseOptionLine(line)) {
        currentQuestion.text += ' ' + line;
      }
    }
  }
  
  // Don't forget the last question
  if (currentQuestion && optionCount >= 2) {
    currentQuestion.options = [...currentOptions];
    questions.push(currentQuestion);
  }
  
  // Validate and clean questions
  const validQuestions = questions.filter(q => {
    // Must have at least 2 non-empty options
    const nonEmptyOptions = q.options.filter(o => o.length > 0).length;
    if (nonEmptyOptions < 2) {
      warnings.push(`Skipped: "${q.text.substring(0, 30)}..." - insufficient options`);
      return false;
    }
    
    // Fill empty options with placeholders
    q.options = q.options.map((opt, idx) => 
      opt || `Option ${String.fromCharCode(65 + idx)}`
    );
    
    return true;
  });
  
  console.log(`✅ Extracted ${validQuestions.length} valid questions`);
  console.log(`🗑️ Removed ${removedContent.length} waste lines`);
  console.log(`📝 Question lines found: ${questionLines.length}`);
  
  if (warnings.length > 0) {
    console.log('⚠️ Warnings:', warnings);
  }
  
  return {
    questions: validQuestions,
    totalExtracted: validQuestions.length,
    removedContent,
    warnings,
    rawText: text
  };
}

/**
 * Alternative parser for different PDF formats
 */
export function parseQuestionsFromText(text: string): ParsedQuestion[] {
  const result = smartParsePDF(text);
  return result.questions;
}

export default smartParsePDF;
