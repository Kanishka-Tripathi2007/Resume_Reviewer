document.addEventListener('DOMContentLoaded', () => {
  const resumeForm = document.getElementById('resume-form');
  const resumeInput = document.getElementById('resume-input');
  const pdfInput = document.getElementById('pdf-input');
  const pdfStatus = document.getElementById('pdf-status');
  const roleSelect = document.getElementById('role-select');
  const fieldSelect = document.getElementById('field-select');
  const roleInput = document.getElementById('role-input');
  const levelSelect = document.getElementById('level-select');
  const charCount = document.getElementById('char-count');
  const reviewBtn = document.getElementById('review-btn');
  const errorMsg = document.getElementById('error-msg');
  const feedbackSection = document.getElementById('feedback-section');
  const loadingIndicator = document.getElementById('loading');
  const scoreElement = document.getElementById('score');
  const strengthsList = document.getElementById('strengths-list');
  const weaknessesList = document.getElementById('weaknesses-list');
  const keywordsList = document.getElementById('keywords-list');
  const improvementsList = document.getElementById('improvements-list');
  const startInterviewBtn = document.getElementById('start-interview-btn');

  if (!resumeInput || !charCount || !errorMsg) {
    return;
  }

  // Ensure #start-interview-btn is initially hidden
  if (startInterviewBtn) {
    startInterviewBtn.hidden = true;
  }

  // Escape HTML characters to prevent HTML/XSS injection
  function escapeHtml(str) {
    if (typeof str !== 'string') {
      return String(str ?? '');
    }
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Strip markdown code fences (e.g. ```json ... ``` or ``` ... ```) if present
  function stripCodeFences(text) {
    if (typeof text !== 'string') {
      return text;
    }
    let cleaned = text.trim();
    // Check if entire text is enclosed in code fences
    const wholeFenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (wholeFenceMatch) {
      return wholeFenceMatch[1].trim();
    }
    // Check for code fences embedded within text
    const embeddedFenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (embeddedFenceMatch) {
      return embeddedFenceMatch[1].trim();
    }
    // Fallback: extract substring between first '{' and last '}'
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return cleaned.substring(firstBrace, lastBrace + 1);
    }
    return cleaned;
  }

  // Safely populate a list element with escaped items
  function populateList(listElement, items) {
    if (!listElement) {
      return;
    }
    listElement.innerHTML = '';
    if (!Array.isArray(items)) {
      return;
    }

    items.forEach((item) => {
      const rawText = typeof item === 'string' ? item : JSON.stringify(item);
      const safeText = escapeHtml(rawText);
      const li = document.createElement('li');
      li.innerHTML = safeText;
      listElement.appendChild(li);
    });
  }

  // Update #char-count as the user types
  function updateCharCount() {
    const count = resumeInput.value.length;
    charCount.textContent = `${count} character${count === 1 ? '' : 's'}`;

    // Clear error message if user has satisfied minimum character requirement
    if (resumeInput.value.trim().length >= 100 && errorMsg.textContent) {
      errorMsg.textContent = '';
    }
  }

  function setPdfStatus(message, state = '') {
    if (!pdfStatus) {
      return;
    }
    pdfStatus.textContent = message;
    if (state) {
      pdfStatus.dataset.state = state;
    } else {
      delete pdfStatus.dataset.state;
    }
  }

  // Clean PDF text while preserving paragraphs, headings, and list items.
  function cleanExtractedText(text) {
    const lines = text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[\t ]+/g, ' ').trim());
    const paragraphs = [];
    let paragraphLines = [];
    const startsListItem = (line) => /^(?:[-*•▪‣]|\d+[.)]|[A-Za-z][.)])\s/.test(line);
    const looksLikeHeading = (line) =>
      line.length <= 70 &&
      !startsListItem(line) &&
      (/[:：]$/.test(line) ||
        (/^[A-Z\s&/+-]+$/.test(line) && /[A-Z]/.test(line)) ||
        /^(summary|profile|objective|experience|work experience|professional experience|education|skills|technical skills|certifications|projects|awards|publications|volunteering)$/i.test(
          line
        ));

    function flushParagraph() {
      if (paragraphLines.length) {
        paragraphs.push(paragraphLines.join(' ').trim());
        paragraphLines = [];
      }
    }

    lines.forEach((line) => {
      if (!line) {
        flushParagraph();
        return;
      }

      const previousLine = paragraphLines[paragraphLines.length - 1];
      if (
        previousLine &&
        (startsListItem(line) || /[.!?]$/.test(previousLine) || looksLikeHeading(previousLine))
      ) {
        flushParagraph();
      }
      paragraphLines.push(line);
    });

    flushParagraph();
    return paragraphs.join('\n\n').trim();
  }

  resumeInput.addEventListener('input', updateCharCount);

  if (pdfInput && pdfStatus) {
    let extractionId = 0;

    pdfInput.addEventListener('change', async () => {
      const currentExtractionId = ++extractionId;
      const file = pdfInput.files?.[0];
      setPdfStatus('');

      if (!file) {
        return;
      }

      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if (!isPdf) {
        setPdfStatus('Please choose a PDF file.', 'error');
        pdfInput.value = '';
        return;
      }

      if (file.size >= 5 * 1024 * 1024) {
        setPdfStatus('Please choose a PDF under 5 MB.', 'error');
        pdfInput.value = '';
        return;
      }

      if (!window.pdfjsLib?.getDocument) {
        setPdfStatus('PDF reading is unavailable. Please paste your resume text instead.', 'error');
        return;
      }

      setPdfStatus('Reading your PDF…');

      let pdfDocument;
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const bytes = new Uint8Array(await file.arrayBuffer());
        pdfDocument = await window.pdfjsLib.getDocument({ data: bytes }).promise;
        const pages = [];

        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
          const page = await pdfDocument.getPage(pageNumber);
          const content = await page.getTextContent();
          pages.push(content.items.map((item) => item.str || '').join(' ').trim());
        }

        if (currentExtractionId !== extractionId) {
          return;
        }

        const extractedText = cleanExtractedText(pages.join('\n\n'));
        resumeInput.value = extractedText;
        updateCharCount();

        if (extractedText.length < 100) {
          setPdfStatus(
            `Extracted ${pdfDocument.numPages} pages. Very little text was found; this PDF may be scanned or image-based, so please paste the resume text instead.`,
            'warning'
          );
        } else {
          setPdfStatus(`Extracted ${pdfDocument.numPages} pages`, 'success');
        }
      } catch (error) {
        if (currentExtractionId === extractionId) {
          setPdfStatus(
            'Could not read this PDF. Please try another file or paste your resume text instead.',
            'error'
          );
        }
      } finally {
        if (pdfDocument) {
          await pdfDocument.destroy().catch(() => {});
        }
      }
    });
  }

  // Initialize character count on load
  updateCharCount();

  // Handle form submission and resume review
  async function handleReview(event) {
    if (event) {
      event.preventDefault();
    }

    const resumeText = resumeInput.value.trim();

    // Check if resume is at least 100 characters
    if (resumeText.length < 100) {
      errorMsg.textContent = 'Resume must be at least 100 characters long.';
      resumeInput.focus();
      return;
    }

    // Validate role selection if present
    if (roleSelect && !roleSelect.value) {
      errorMsg.textContent = 'Please select a target role.';
      roleSelect.focus();
      return;
    }

    if (fieldSelect && !fieldSelect.value) {
      errorMsg.textContent = 'Please select a field.';
      fieldSelect.focus();
      return;
    }

    // Validate experience level selection if present
    if (levelSelect && !levelSelect.value) {
      errorMsg.textContent = 'Please select an experience level.';
      levelSelect.focus();
      return;
    }

    // Clear any previous error message
    errorMsg.textContent = '';

    // Disable button to prevent duplicate submissions
    if (reviewBtn) {
      reviewBtn.disabled = true;
    }

    // Hide #start-interview-btn and reset score/lists before new review starts
    if (startInterviewBtn) {
      startInterviewBtn.hidden = true;
    }
    if (scoreElement) {
      scoreElement.textContent = '/10';
    }
    if (strengthsList) {
      strengthsList.innerHTML = '';
    }
    if (weaknessesList) {
      weaknessesList.innerHTML = '';
    }
    if (keywordsList) {
      keywordsList.innerHTML = '';
    }
    if (improvementsList) {
      improvementsList.innerHTML = '';
    }

    // Show #feedback-section and #loading
    if (feedbackSection) {
      feedbackSection.hidden = false;
      feedbackSection.scrollIntoView({ behavior: 'smooth' });
    }

    if (loadingIndicator) {
      loadingIndicator.hidden = false;
    }

    try {
      const selectedRole = roleSelect ? roleSelect.value : '';
      const selectedField = fieldSelect ? fieldSelect.value : '';
      const exactRole = roleInput ? roleInput.value.trim() : '';
      const selectedLevel = levelSelect ? levelSelect.value : '';

      const systemPrompt =
        'You are an expert technical recruiter and resume reviewer. ' +
        'Evaluate the resume against the target role and experience level. ' +
        'Respond strictly with a JSON object containing the following keys:\n' +
        '- "score": a number from 1 to 10\n' +
        '- "strengths": an array of concise bullet point strings\n' +
        '- "weaknesses": an array of areas for improvement strings\n' +
        '- "missing_keywords": an array of missing industry keywords strings\n' +
        '- "improvements": an array of concrete suggestion strings\n\n' +
        'If the input text is not a resume or cannot be evaluated, respond with:\n' +
        '{"error": "Explanation of why the resume could not be reviewed."}\n' +
        'Do not include any explanation or markdown outside the JSON object.';

      const userContent = `Field: ${selectedField}\nExact Role: ${exactRole || 'Not specified'}\nTarget Role: ${selectedRole}\nExperience Level: ${selectedLevel}\n\nResume text:\n${resumeText}`;

      // POST to /api/chat with mode "review", the resume, the selected role, and the level
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'review',
          resume: resumeText,
          role: selectedRole,
          field: selectedField,
          exactRole,
          level: selectedLevel,
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: userContent,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error || `Server responded with status ${response.status}`
        );
      }

      const data = await response.json();

      // Successfully finished review request, hide loading indicator
      if (loadingIndicator) {
        loadingIndicator.hidden = true;
      }

      // Parse API reply safely inside try/catch (stripping code fences first)
      let parsedData = null;
      try {
        const rawReply = data?.reply;
        if (typeof rawReply === 'object' && rawReply !== null) {
          parsedData = rawReply;
        } else if (typeof rawReply === 'string') {
          const stripped = stripCodeFences(rawReply);
          parsedData = JSON.parse(stripped);
        } else {
          throw new Error('Invalid reply format.');
        }
      } catch (parseErr) {
        throw new Error(
          'Failed to parse feedback from the review service. Please try again.'
        );
      }

      // If it contains an "error" field, show it in #error-msg
      if (parsedData && parsedData.error) {
        errorMsg.textContent = escapeHtml(parsedData.error);
        if (startInterviewBtn) {
          startInterviewBtn.hidden = true;
        }
        return;
      }

      // Otherwise fill #score and the four lists, then reveal #start-interview-btn
      if (
        scoreElement &&
        parsedData.score !== undefined &&
        parsedData.score !== null
      ) {
        const rawScore = String(parsedData.score).trim();
        const formatted = rawScore.endsWith('/10') ? rawScore : `${rawScore}/10`;
        scoreElement.innerHTML = escapeHtml(formatted);
      }

      populateList(strengthsList, parsedData.strengths);
      populateList(weaknessesList, parsedData.weaknesses);
      populateList(keywordsList, parsedData.missing_keywords);
      populateList(improvementsList, parsedData.improvements);

      // Reveal #start-interview-btn
      if (startInterviewBtn) {
        startInterviewBtn.hidden = false;
      }
    } catch (error) {
      // Handle network errors and request failures
      if (loadingIndicator) {
        loadingIndicator.hidden = true;
      }
      errorMsg.textContent = escapeHtml(
        error.message ||
          'A network error occurred while reviewing your resume. Please check your connection and try again.'
      );
      if (startInterviewBtn) {
        startInterviewBtn.hidden = true;
      }
    } finally {
      // Re-enable the button afterwards
      if (reviewBtn) {
        reviewBtn.disabled = false;
      }
    }
  }

  if (resumeForm) {
    resumeForm.addEventListener('submit', handleReview);
  } else if (reviewBtn) {
    reviewBtn.addEventListener('click', handleReview);
  }
});
