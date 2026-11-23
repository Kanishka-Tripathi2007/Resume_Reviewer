document.addEventListener('DOMContentLoaded', () => {
  const interviewSection = document.getElementById('interview-section');
  const startInterviewBtn = document.getElementById('start-interview-btn');
  const chatBox = document.getElementById('chat-box');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const typingIndicator = document.getElementById('typing-indicator');
  const interviewSummary = document.getElementById('interview-summary');
  const restartBtn = document.getElementById('restart-interview-btn');

  if (!chatBox || !chatForm || !chatInput) {
    return;
  }

  // Count the interviewer's questions
  let questionCount = 0;
  const MAX_QUESTIONS = 5;

  // Generate system prompt incorporating role and level if selected
  function getSystemPrompt() {
    const roleSelect = document.getElementById('role-select');
    const levelSelect = document.getElementById('level-select');
    const role = roleSelect?.value || 'Software Developer';
    const level = levelSelect?.value || 'Candidate';

    return (
      `You are an expert technical interviewer conducting a structured ${MAX_QUESTIONS}-question mock interview for a ${level} ${role} position. ` +
      `Ask realistic, concise questions one at a time, numbering them clearly (e.g. "Question 1 of 5: ..."). ` +
      `Listen to the candidate's answers, provide brief feedback if relevant, and ask the next question until question 5. ` +
      `Keep questions focused, conversational, and tailored to the target role.`
    );
  }

  // Conversation history array
  const messages = [
    {
      role: 'system',
      content: getSystemPrompt(),
    },
  ];

  window.messages = messages;

  // Scroll #chat-box to the bottom
  function scrollToBottom() {
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // Add message bubble to #chat-box
  function appendMessage(role, text) {
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message chat-message-${role}`;
    // Use textContent to safely escape HTML and prevent injection
    messageEl.textContent = text;
    chatBox.appendChild(messageEl);
    scrollToBottom();
  }

  // Trigger the first question when interview starts
  async function triggerFirstQuestion() {
    questionCount = 1;

    if (typingIndicator) {
      typingIndicator.hidden = false;
      scrollToBottom();
    }
    chatInput.disabled = true;
    if (sendBtn) {
      sendBtn.disabled = true;
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'interview',
          messages: [
            ...messages,
            {
              role: 'user',
              content:
                'Please begin the mock interview now. Introduce yourself briefly and ask Question 1 of 5.',
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data = await response.json();
      const reply =
        data?.reply ||
        'Welcome to your mock interview! Question 1 of 5: Could you please introduce yourself and walk me through your background?';

      appendMessage('assistant', reply);
      messages.push({ role: 'assistant', content: reply });
    } catch (err) {
      const fallback =
        'Welcome to your mock interview! Question 1 of 5: Tell me about yourself and your experience related to this role.';
      appendMessage('assistant', fallback);
      messages.push({ role: 'assistant', content: fallback });
    } finally {
      if (typingIndicator) {
        typingIndicator.hidden = true;
      }
      chatInput.disabled = false;
      if (sendBtn) {
        sendBtn.disabled = false;
      }
      chatInput.focus();
      scrollToBottom();
    }
  }

  // Request final summary after question 5 and the user's answer
  async function requestFinalSummary() {
    if (typingIndicator) {
      typingIndicator.hidden = false;
      scrollToBottom();
    }

    // Disable input while generating summary and for interview conclusion
    chatInput.disabled = true;
    if (sendBtn) {
      sendBtn.disabled = true;
    }

    try {
      const summaryMessages = [
        ...messages,
        {
          role: 'user',
          content:
            'The candidate has answered all 5 questions. Please provide a comprehensive final summary of the interview. ' +
            'Provide an overall assessment score out of 10, key strengths demonstrated, areas for improvement, and practical interview tips.',
        },
      ];

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'interview',
          messages: summaryMessages,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error || `Server responded with status ${response.status}`
        );
      }

      const data = await response.json();
      const summaryText =
        data?.reply ||
        'Interview complete. Thank you for completing your mock interview session!';

      // Show final summary in #interview-summary
      if (interviewSummary) {
        interviewSummary.textContent = summaryText;
        interviewSummary.hidden = false;
      }

      // Also append final summary message into the chat log
      appendMessage(
        'assistant',
        `🏁 Final Interview Summary:\n\n${summaryText}`
      );
    } catch (error) {
      if (interviewSummary) {
        interviewSummary.textContent = `Error generating interview summary: ${error.message}`;
        interviewSummary.hidden = false;
      }
      appendMessage(
        'assistant',
        `Error generating final summary: ${error.message || 'Network error'}`
      );
    } finally {
      if (typingIndicator) {
        typingIndicator.hidden = true;
      }

      // Disable the input after the interview completes
      chatInput.disabled = true;
      if (sendBtn) {
        sendBtn.disabled = true;
      }
      chatInput.placeholder = 'Interview complete. Click Restart to try again.';

      // Add / reveal "Restart" option
      if (restartBtn) {
        restartBtn.hidden = false;
      }
      scrollToBottom();
    }
  }

  // Reveal interview section and start interview when #start-interview-btn is clicked
  if (startInterviewBtn) {
    startInterviewBtn.addEventListener('click', () => {
      if (interviewSection) {
        interviewSection.hidden = false;
        interviewSection.scrollIntoView({ behavior: 'smooth' });
      }

      // Trigger question 1 if not already begun
      if (questionCount === 0 && chatBox.children.length === 0) {
        triggerFirstQuestion();
      } else {
        chatInput.focus();
      }
    });
  }

  // Handle sending an answer (via button click or Enter key)
  async function handleSendMessage(event) {
    if (event) {
      event.preventDefault();
    }

    // Read and trim user input; ignore if empty
    const answerText = chatInput.value.trim();
    if (!answerText) {
      return;
    }

    // Clear input field immediately
    chatInput.value = '';

    // Add user answer to #chat-box
    appendMessage('user', answerText);

    // Push user message into messages array
    messages.push({
      role: 'user',
      content: answerText,
    });

    scrollToBottom();

    // If user typed before question 1 was triggered, treat as answering question 1
    if (questionCount === 0) {
      questionCount = 1;
    }

    // Check if the user just answered question 5
    if (questionCount >= MAX_QUESTIONS) {
      // After question 5 and user's answer: request final summary, show it in #interview-summary, and disable input
      await requestFinalSummary();
      return;
    }

    // Otherwise, request the next interviewer question
    if (typingIndicator) {
      typingIndicator.hidden = false;
      scrollToBottom();
    }

    if (sendBtn) {
      sendBtn.disabled = true;
    }
    chatInput.disabled = true;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'interview',
          messages: messages,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error || `Server responded with status ${response.status}`
        );
      }

      const data = await response.json();
      const reply = data?.reply || 'Could you elaborate on that?';

      // Increment question count for interviewer's question
      questionCount++;

      // Display the question in #chat-box
      appendMessage('assistant', reply);

      // Push reply into messages array
      messages.push({
        role: 'assistant',
        content: reply,
      });
    } catch (error) {
      appendMessage(
        'assistant',
        `Error: ${error.message || 'Unable to connect to the interviewer. Please try again.'}`
      );
    } finally {
      if (typingIndicator) {
        typingIndicator.hidden = true;
      }

      if (sendBtn) {
        sendBtn.disabled = false;
      }
      chatInput.disabled = false;
      chatInput.focus();
      scrollToBottom();
    }
  }

  // Handle form submission (covers both send button click and Enter key)
  chatForm.addEventListener('submit', handleSendMessage);

  // Restart interview option
  function restartInterview() {
    questionCount = 0;

    // Reset messages array
    messages.length = 0;
    messages.push({
      role: 'system',
      content: getSystemPrompt(),
    });

    // Clear chat box and summary
    chatBox.innerHTML = '';
    if (interviewSummary) {
      interviewSummary.textContent = '';
      interviewSummary.hidden = true;
    }

    // Hide restart button
    if (restartBtn) {
      restartBtn.hidden = true;
    }

    // Re-enable input and button
    chatInput.disabled = false;
    chatInput.value = '';
    chatInput.placeholder = 'Type your answer…';
    if (sendBtn) {
      sendBtn.disabled = false;
    }
    chatInput.focus();

    // Trigger Question 1 fresh
    triggerFirstQuestion();
  }

  if (restartBtn) {
    restartBtn.addEventListener('click', restartInterview);
  }
});
