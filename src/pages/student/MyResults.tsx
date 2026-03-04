import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

interface ExamResult {
  id: string;
  examId: string;
  examTitle: string;
  subject: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  skippedAnswers: number;
  percentage: number;
  passed: boolean;
  violations: number;
  timeTaken: string;
  submittedAt: string;
  answers: {
    questionId: string;
    questionText: string;
    options: string[];
    selectedAnswer: number | null;
    correctAnswer: number;
    isCorrect: boolean;
  }[];
}

export default function MyResults() {
  const { user } = useAuth();
  const [results, setResults] = useState<ExamResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<ExamResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadResults();
  }, [user]);

  const loadResults = async () => {
    setLoading(true);
    try {
      // Load from localStorage
      const localResults = JSON.parse(localStorage.getItem('student_exam_results') || '[]');
      
      // Filter results for current user
      const userResults = localResults.filter((r: any) => 
        r.useremail === user?.email || r.userId === user?.id
      );

      // Try to load from Supabase
      if (user?.id) {
        const { data: supabaseResults } = await supabase
          .from('exam_attempts')
          .select(`
            *,
            exams (title, subject)
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (supabaseResults && supabaseResults.length > 0) {
          const formattedResults = supabaseResults.map((r: any) => ({
            id: r.id,
            examId: r.exam_id,
            examTitle: r.exams?.title || 'Unknown Exam',
            subject: r.exams?.subject || 'Unknown',
            score: r.score || 0,
            totalQuestions: r.total_questions || 0,
            correctAnswers: r.correct_answers || 0,
            wrongAnswers: r.wrong_answers || 0,
            skippedAnswers: r.unanswered || 0,
            percentage: r.score || 0,
            passed: (r.score || 0) >= 40,
            violations: r.violation_count || 0,
            timeTaken: r.time_taken || 'N/A',
            submittedAt: r.created_at,
            answers: r.answers || []
          }));
          
          // Merge with local results
          const allResults = [...formattedResults, ...userResults];
          const uniqueResults = allResults.filter((r, i, self) => 
            i === self.findIndex(t => t.id === r.id || (t.examId === r.examId && t.submittedAt === r.submittedAt))
          );
          
          setResults(uniqueResults);
        } else {
          setResults(userResults);
        }
      } else {
        setResults(userResults);
      }
    } catch (error) {
      console.error('Error loading results:', error);
      // Load from localStorage as fallback
      const localResults = JSON.parse(localStorage.getItem('student_exam_results') || '[]');
      setResults(localResults.filter((r: any) => r.userEmail === user?.email));
    }
    setLoading(false);
  };

  const filteredResults = results.filter(r => {
    const matchesFilter = filter === 'all' || 
      (filter === 'passed' && r.passed) || 
      (filter === 'failed' && !r.passed);
    const matchesSearch = r.examTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.subject.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getGrade = (percentage: number) => {
    if (percentage >= 90) return { grade: 'A+', color: 'text-green-600', bg: 'bg-green-100' };
    if (percentage >= 80) return { grade: 'A', color: 'text-green-600', bg: 'bg-green-100' };
    if (percentage >= 70) return { grade: 'B+', color: 'text-blue-600', bg: 'bg-blue-100' };
    if (percentage >= 60) return { grade: 'B', color: 'text-blue-600', bg: 'bg-blue-100' };
    if (percentage >= 50) return { grade: 'C+', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    if (percentage >= 40) return { grade: 'C', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { grade: 'F', color: 'text-red-600', bg: 'bg-red-100' };
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const downloadResult = (result: ExamResult) => {
    let content = `
╔══════════════════════════════════════════════════════════════╗
║                    TESTKARO - EXAM RESULT                    ║
╚══════════════════════════════════════════════════════════════╝

STUDENT DETAILS
═══════════════
Name        : ${user?.name || 'Student'}
Email       : ${user?.email || 'N/A'}
Roll Number : ${user?.rollNumber || 'N/A'}

EXAM DETAILS
════════════
Exam Title  : ${result.examTitle}
Subject     : ${result.subject}
Date        : ${formatDate(result.submittedAt)}
Time Taken  : ${result.timeTaken}

RESULT SUMMARY
══════════════
Score       : ${result.percentage.toFixed(1)}%
Grade       : ${getGrade(result.percentage).grade}
Status      : ${result.passed ? '✅ PASSED' : '❌ FAILED'}

Total Questions : ${result.totalQuestions}
Correct Answers : ${result.correctAnswers}
Wrong Answers   : ${result.wrongAnswers}
Skipped         : ${result.skippedAnswers}
Violations      : ${result.violations}

QUESTION-WISE ANALYSIS
══════════════════════
`;

    if (result.answers && result.answers.length > 0) {
      result.answers.forEach((ans, idx) => {
        const optionLabels = ['A', 'B', 'C', 'D'];
        content += `
Q${idx + 1}. ${ans.questionText}
`;
        ans.options.forEach((opt, optIdx) => {
          let marker = '   ';
          if (optIdx === ans.correctAnswer) marker = ' ✓ ';
          if (optIdx === ans.selectedAnswer && optIdx !== ans.correctAnswer) marker = ' ✗ ';
          content += `    ${optionLabels[optIdx]}) ${opt} ${marker}\n`;
        });
        content += `    Your Answer: ${ans.selectedAnswer !== null ? optionLabels[ans.selectedAnswer] : 'Skipped'}\n`;
        content += `    Status: ${ans.isCorrect ? '✓ CORRECT' : ans.selectedAnswer === null ? '○ SKIPPED' : '✗ WRONG'}\n`;
      });
    }

    content += `
════════════════════════════════════════════════════════════════
                  Generated by TestKaro
                  ${new Date().toLocaleString()}
════════════════════════════════════════════════════════════════
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Result_${result.examTitle.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your results...</p>
        </div>
      </div>
    );
  }

  // Detail View Modal
  if (selectedResult) {
    const gradeInfo = getGrade(selectedResult.percentage);
    
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
            <div className={`p-6 ${selectedResult.passed ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-red-500 to-pink-600'} text-white`}>
              <button
                onClick={() => setSelectedResult(null)}
                className="flex items-center gap-2 text-white/80 hover:text-white mb-4"
              >
                ← Back to All Results
              </button>
              <h1 className="text-2xl font-bold">{selectedResult.examTitle}</h1>
              <p className="opacity-80">{selectedResult.subject}</p>
            </div>

            {/* Score Card */}
            <div className="p-6">
              <div className="flex flex-wrap items-center justify-center gap-6">
                <div className="text-center">
                  <div className={`text-6xl font-bold ${gradeInfo.color}`}>
                    {selectedResult.percentage.toFixed(0)}%
                  </div>
                  <div className={`inline-block px-4 py-1 rounded-full ${gradeInfo.bg} ${gradeInfo.color} font-semibold mt-2`}>
                    Grade: {gradeInfo.grade}
                  </div>
                </div>
                <div className={`px-6 py-3 rounded-xl text-xl font-bold ${selectedResult.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {selectedResult.passed ? '✅ PASSED' : '❌ FAILED'}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-xl shadow text-center">
              <div className="text-3xl font-bold text-gray-800">{selectedResult.totalQuestions}</div>
              <div className="text-gray-500 text-sm">Total Questions</div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow text-center">
              <div className="text-3xl font-bold text-green-600">{selectedResult.correctAnswers}</div>
              <div className="text-gray-500 text-sm">Correct ✓</div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow text-center">
              <div className="text-3xl font-bold text-red-600">{selectedResult.wrongAnswers}</div>
              <div className="text-gray-500 text-sm">Wrong ✗</div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow text-center">
              <div className="text-3xl font-bold text-gray-400">{selectedResult.skippedAnswers}</div>
              <div className="text-gray-500 text-sm">Skipped ○</div>
            </div>
          </div>

          {/* Exam Details */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">📝 Exam Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Submitted On:</span>
                <span className="ml-2 font-medium">{formatDate(selectedResult.submittedAt)}</span>
              </div>
              <div>
                <span className="text-gray-500">Time Taken:</span>
                <span className="ml-2 font-medium">{selectedResult.timeTaken}</span>
              </div>
              <div>
                <span className="text-gray-500">Violations:</span>
                <span className={`ml-2 font-medium ${selectedResult.violations > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {selectedResult.violations}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Status:</span>
                <span className={`ml-2 font-medium ${selectedResult.passed ? 'text-green-600' : 'text-red-600'}`}>
                  {selectedResult.passed ? 'Passed' : 'Failed'}
                </span>
              </div>
            </div>
          </div>

          {/* Question-wise Analysis */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">📝 Question-wise Analysis</h2>
              <button
                onClick={() => downloadResult(selectedResult)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                📥 Download Result
              </button>
            </div>

            {selectedResult.answers && selectedResult.answers.length > 0 ? (
              <div className="space-y-4">
                {selectedResult.answers.map((ans, idx) => {
                  const optionLabels = ['A', 'B', 'C', 'D'];
                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-xl border-2 ${
                        ans.isCorrect
                          ? 'border-green-200 bg-green-50'
                          : ans.selectedAnswer === null
                          ? 'border-gray-200 bg-gray-50'
                          : 'border-red-200 bg-red-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${
                          ans.isCorrect ? 'bg-green-500' : ans.selectedAnswer === null ? 'bg-gray-400' : 'bg-red-500'
                        }`}>
                          {ans.isCorrect ? '✓' : ans.selectedAnswer === null ? '○' : '✗'}
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800 mb-3">
                            Q{idx + 1}. {ans.questionText}
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {ans.options.map((opt, optIdx) => {
                              const isCorrect = optIdx === ans.correctAnswer;
                              const isSelected = optIdx === ans.selectedAnswer;
                              const isWrong = isSelected && !isCorrect;

                              return (
                                <div
                                  key={optIdx}
                                  className={`p-3 rounded-lg border-2 flex items-center gap-2 ${
                                    isCorrect
                                      ? 'border-green-500 bg-green-100'
                                      : isWrong
                                      ? 'border-red-500 bg-red-100'
                                      : 'border-gray-200 bg-white'
                                  }`}
                                >
                                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                    isCorrect
                                      ? 'bg-green-500 text-white'
                                      : isWrong
                                      ? 'bg-red-500 text-white'
                                      : 'bg-gray-200 text-gray-600'
                                  }`}>
                                    {optionLabels[optIdx]}
                                  </span>
                                  <span className={`flex-1 ${isCorrect ? 'font-semibold text-green-700' : isWrong ? 'text-red-700' : ''}`}>
                                    {opt}
                                  </span>
                                  {isCorrect && <span className="text-green-600 font-bold">✓ Correct</span>}
                                  {isWrong && <span className="text-red-600 font-bold">✗ Your Answer</span>}
                                </div>
                              );
                            })}
                          </div>
                          {ans.selectedAnswer === null && (
                            <p className="mt-2 text-gray-500 italic">○ Not answered</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>Question details not available for this exam.</p>
                <p className="text-sm mt-2">This may be an older exam result.</p>
              </div>
            )}
          </div>

          {/* Back Button */}
          <div className="text-center pb-8">
            <button
              onClick={() => setSelectedResult(null)}
              className="px-8 py-3 bg-gray-800 text-white rounded-xl hover:bg-gray-900"
            >
              ← Back to All Results
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Results List View
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl shadow-lg p-6 mb-6 text-white">
          <h1 className="text-2xl font-bold">📊 My Exam Results</h1>
          <p className="opacity-80">View all your past exam results with detailed analysis</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-xl shadow text-center">
            <div className="text-3xl font-bold text-blue-600">{results.length}</div>
            <div className="text-gray-500 text-sm">Total Exams</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow text-center">
            <div className="text-3xl font-bold text-green-600">{results.filter(r => r.passed).length}</div>
            <div className="text-gray-500 text-sm">Passed</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow text-center">
            <div className="text-3xl font-bold text-red-600">{results.filter(r => !r.passed).length}</div>
            <div className="text-gray-500 text-sm">Failed</div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow text-center">
            <div className="text-3xl font-bold text-purple-600">
              {results.length > 0 ? (results.reduce((acc, r) => acc + r.percentage, 0) / results.length).toFixed(0) : 0}%
            </div>
            <div className="text-gray-500 text-sm">Avg Score</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <input
              type="text"
              placeholder="🔍 Search exams..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 min-w-[200px] px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg ${filter === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('passed')}
                className={`px-4 py-2 rounded-lg ${filter === 'passed' ? 'bg-green-500 text-white' : 'bg-gray-100'}`}
              >
                ✅ Passed
              </button>
              <button
                onClick={() => setFilter('failed')}
                className={`px-4 py-2 rounded-lg ${filter === 'failed' ? 'bg-red-500 text-white' : 'bg-gray-100'}`}
              >
                ❌ Failed
              </button>
            </div>
          </div>
        </div>

        {/* Results List */}
        {filteredResults.length > 0 ? (
          <div className="space-y-4">
            {filteredResults.map((result) => {
              const gradeInfo = getGrade(result.percentage);
              return (
                <div
                  key={result.id}
                  className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow cursor-pointer"
                  onClick={() => setSelectedResult(result)}
                >
                  <div className="flex flex-col md:flex-row">
                    {/* Left - Score */}
                    <div className={`p-6 flex items-center justify-center ${result.passed ? 'bg-green-500' : 'bg-red-500'} text-white md:w-32`}>
                      <div className="text-center">
                        <div className="text-3xl font-bold">{result.percentage.toFixed(0)}%</div>
                        <div className={`text-sm px-2 py-0.5 rounded ${gradeInfo.bg} ${gradeInfo.color}`}>
                          {gradeInfo.grade}
                        </div>
                      </div>
                    </div>

                    {/* Middle - Info */}
                    <div className="flex-1 p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-gray-800">{result.examTitle}</h3>
                          <p className="text-gray-500">{result.subject}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${result.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {result.passed ? '✅ Passed' : '❌ Failed'}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600">
                        <span>📅 {formatDate(result.submittedAt)}</span>
                        <span>⏱️ {result.timeTaken}</span>
                        <span>✓ {result.correctAnswers}/{result.totalQuestions}</span>
                        {result.violations > 0 && (
                          <span className="text-red-500">⚠️ {result.violations} violations</span>
                        )}
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-3">
                        <div className="flex gap-1 h-2">
                          <div
                            className="bg-green-500 rounded-l"
                            style={{ width: `${(result.correctAnswers / result.totalQuestions) * 100}%` }}
                          ></div>
                          <div
                            className="bg-red-500"
                            style={{ width: `${(result.wrongAnswers / result.totalQuestions) * 100}%` }}
                          ></div>
                          <div
                            className="bg-gray-300 rounded-r"
                            style={{ width: `${(result.skippedAnswers / result.totalQuestions) * 100}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-xs mt-1 text-gray-500">
                          <span className="text-green-600">✓ {result.correctAnswers} correct</span>
                          <span className="text-red-600">✗ {result.wrongAnswers} wrong</span>
                          <span className="text-gray-400">○ {result.skippedAnswers} skipped</span>
                        </div>
                      </div>
                    </div>

                    {/* Right - View Button */}
                    <div className="p-4 flex items-center border-l">
                      <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 whitespace-nowrap">
                        👁️ View Details
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <div className="text-6xl mb-4">📝</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">No Results Found</h3>
            <p className="text-gray-500">
              {results.length === 0
                ? "You haven't taken any exams yet."
                : 'No results match your search criteria.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
