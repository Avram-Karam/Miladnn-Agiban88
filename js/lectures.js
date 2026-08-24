(function () {
    'use strict';

    const modal = document.getElementById('lectureModal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');

    let lectures = [];
    let activeLecture = null;
    let submitting = false;

    const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#039;',
        '"': '&quot;'
    }[c]));

    function fmt(time) {
        return String(time || '').replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h, min) => {
            h = Number(h);
            const period = h >= 12 ? 'م' : 'ص';
            if (h > 12) h -= 12;
            if (h === 0) h = 12;
            return String(h).padStart(2, '0') + ':' + min + ' ' + period;
        });
    }

    function norm(value) {
        return String(value ?? '')
            .trim()
            .toLowerCase()
            .replace(/[ًٌٍَُِّْـ]/g, '')
            .replace(/[إأآا]/g, 'ا')
            .replace(/ى/g, 'ي')
            .replace(/ة/g, 'ه')
            .replace(/[.,،؛;:!?؟"'«»()\[\]{}]/g, '')
            .replace(/\s+/g, ' ');
    }

    function acceptedAnswers(answer) {
        return String(answer ?? '')
            .split(/[\/|]/)
            .map(norm)
            .filter(Boolean);
    }

    function isTextCorrect(value, answer) {
        const normalizedValue = norm(value);
        return !!normalizedValue &&
            acceptedAnswers(answer).some(item => normalizedValue === item);
    }

    function lectureCard(lecture) {
        const card = document.createElement('div');
        card.className = 'lecture-card';
        card.tabIndex = 0;

        card.innerHTML = `
            <div class="lecture-card-top-bar">
                ${lecture.speakerImg
                    ? `<img src="${esc(lecture.speakerImg)}" alt="${esc(lecture.speaker)}" class="speaker-avatar-img">`
                    : `<div class="lecture-card-icon"><i class="bi bi-mic-fill"></i></div>`}
                <div class="lecture-card-header-info">
                    <div class="lecture-card-title">${esc(lecture.title)}</div>
                    <div class="lecture-speaker-name">المحاضر: ${esc(lecture.speaker)}</div>
                </div>
            </div>
            <div class="lecture-card-meta">
                <span class="meta-chip">
                    <i class="bi bi-clock-fill me-1"></i>${esc(fmt(lecture.time))}
                </span>
                <span class="meta-chip">
                    <i class="bi bi-geo-alt-fill me-1"></i>${esc(lecture.place)}
                </span>
            </div>
            <p class="lecture-card-summary">${esc(lecture.summary)}</p>
            <div class="lecture-card-btn">
                <span>عرض محتوى المحاضرة</span>
                <i class="bi bi-chevron-left"></i>
            </div>
        `;

        const openCard = () => openLecture(lecture);
        card.addEventListener('click', openCard);
        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openCard();
            }
        });

        return card;
    }

    function questionHtml(question, index, lectureId) {
        const type = question[0];
        const text = question[1];
        const options = question[2] || '';
        const answer = question[3] || '';
        const radioName = `lecture-${lectureId}-q-${index}`;

        if (type === 'اختيار من متعدد' || type === 'صح أم خطأ') {
            const choices = type === 'صح أم خطأ'
                ? ['صح', 'خطأ']
                : options.split('|').filter(Boolean);

            return `
                <div class="q interactive-q" data-type="${esc(type)}"
                     data-answer="${esc(answer)}" data-index="${index}">
                    <strong>${index}. ${esc(text)}</strong>
                    <div class="interactive-options">
                        ${choices.map(choice => `
                            <label class="answer-option">
                                <input type="radio"
                                       name="${esc(radioName)}"
                                       value="${esc(type === 'صح أم خطأ' ? choice : choice.charAt(0))}">
                                <span>${esc(choice)}</span>
                            </label>
                        `).join('')}
                    </div>
                    <div class="q-feedback" aria-live="polite"></div>
                </div>
            `;
        }

        return `
            <div class="q interactive-q" data-type="أكمل"
                 data-answer="${esc(answer)}" data-index="${index}">
                <strong>${index}. ${esc(text)}</strong>
                <input class="fill-answer" type="text" autocomplete="off"
                       placeholder="اكتب إجابتك هنا..."
                       aria-label="إجابة السؤال ${index}">
                <div class="q-feedback" aria-live="polite"></div>
            </div>
        `;
    }

    function buildQuiz(lecture) {
        const questions = Array.isArray(lecture.quiz) ? lecture.quiz : [];

        const multiple = questions.filter(q => q[0] === 'اختيار من متعدد');
        const trueFalse = questions.filter(q => q[0] === 'صح أم خطأ');
        const fill = questions.filter(q => q[0] === 'أكمل');

        let index = 0;

        const renderSection = (heading, list) => {
            if (!list.length) return '';
            const html = `
                <h6>${heading}</h6>
                ${list.map(question => {
                    index += 1;
                    return questionHtml(question, index, lecture.id);
                }).join('')}
            `;
            return html;
        };

        return `
            <div class="quiz" id="quizBox" hidden>
                ${renderSection('أولًا: اختر الإجابة الصحيحة', multiple)}
                ${renderSection('ثانيًا: صح أم خطأ', trueFalse)}
                ${renderSection('ثالثًا: أكمل', fill)}

                <div class="quiz-actions">
                    <button class="quiz-action check-btn" id="checkQuiz" type="button">
                        <i class="bi bi-check2-circle"></i> تحقق من الإجابات
                    </button>
                </div>

                <div class="quiz-result" id="quizResult" aria-live="polite"></div>
            </div>
        `;
    }

    function setQuizLocked(message) {
        const toggle = document.getElementById('quizToggle');
        const quiz = document.getElementById('quizBox');

        if (toggle) {
            toggle.disabled = true;
            toggle.style.opacity = '.65';
            toggle.innerHTML = '<i class="bi bi-check-circle-fill"></i> تم حل كويز هذه المحاضرة بالفعل';
        }

        if (quiz) {
            quiz.hidden = false;
            quiz.querySelectorAll('input, button').forEach(element => {
                element.disabled = true;
            });
        }

        const result = document.getElementById('quizResult');
        if (result) {
            result.textContent = message;
            result.classList.add('show');
        }
    }

    async function refreshSubmissionStatus(lecture) {
        if (!window.YCScoring) return;

        const category = lecture.day === 1 ? 'lecture1' : 'lecture2';
        const name = window.YCScoring.personName();
        const group = window.YCScoring.groupName();

        if (!name || !group) return;

        try {
            const book = await window.YCScoring.fetchScorebook();
            const record = (book.individualScores || []).find(row =>
                String(row.name || '').trim() === name &&
                String(row.group || '').trim() === group &&
                String(row.category || '').trim() === category
            );

            if (record) {
                setQuizLocked(
                    `تم تسجيل هذه المحاولة بالفعل: ${record.score}/${record.max || 15}. إذا حدثت مشكلة، اطلب من الأدمن إعادة فتح الكويز.`
                );
            }
        } catch (error) {
            // فشل قراءة حالة المحاولة لا يمنع فتح الكويز أو حله.
            console.warn('Lecture quiz status check failed:', error);
        }
    }

    async function openLecture(lecture) {
        activeLecture = lecture;
        submitting = false;

        if (!modal || !title || !body) return;

        title.textContent = lecture.title;

        const topics = (lecture.topics || []).map((topic, index) => `
            <div class="topic">
                <b>${index + 1}</b>
                <span>${esc(topic)}</span>
            </div>
        `).join('');

        body.innerHTML = `
            <style>
                .lec-profile{text-align:center;padding:15px;background:rgba(18,15,12,.8);border:1px solid rgba(229,200,120,.25);border-radius:18px}
                .lec-profile img{width:105px;height:105px;border-radius:50%;object-fit:cover;border:3px solid #e5c878}
                .lec-profile h5{color:#e5c878;margin:8px 0 0}
                .summary{margin:14px 0;padding:12px;background:rgba(18,15,12,.7);border-radius:14px;line-height:1.9}
                .topic{display:flex;gap:10px;align-items:flex-start;padding:12px;margin-bottom:8px;background:linear-gradient(145deg,rgba(183,139,50,.13),rgba(18,15,12,.92));border:1px solid rgba(229,200,120,.22);border-radius:14px;line-height:1.8}
                .topic b{width:32px;height:32px;flex:none;border-radius:50%;display:grid;place-items:center;background:#b78b32;color:#111}
                .quiz-toggle{width:100%;margin-top:15px;padding:14px;border-radius:16px;border:1px solid rgba(229,200,120,.35);background:rgba(183,139,50,.16);color:#e5c878;font-weight:900;text-align:right}
                .quiz{margin-top:12px}.quiz[hidden]{display:none}.quiz h6{color:#e5c878;margin:18px 0 9px}
                .q{padding:14px;margin-bottom:10px;background:rgba(18,15,12,.88);border:1px solid rgba(229,200,120,.16);border-radius:14px;line-height:1.85}
                .interactive-options{margin-top:10px;display:grid;gap:8px}
                .answer-option{display:flex;align-items:center;gap:9px;padding:10px 12px;border:1px solid rgba(229,200,120,.18);border-radius:11px;cursor:pointer;background:rgba(0,0,0,.16);transition:.15s}
                .answer-option:hover{border-color:rgba(229,200,120,.5);background:rgba(183,139,50,.12)}
                .answer-option input{accent-color:#e5c878;transform:scale(1.15)}
                .fill-answer{width:100%;margin-top:12px;padding:12px 14px;border-radius:11px;border:1px solid rgba(229,200,120,.25);background:rgba(0,0,0,.28);color:#fff;font-family:inherit;outline:none}
                .fill-answer:focus{border-color:#e5c878;box-shadow:0 0 0 3px rgba(229,200,120,.08)}
                .q.correct{border-color:rgba(74,222,128,.65)}.q.wrong{border-color:rgba(248,113,113,.65)}
                .q-feedback{display:none;margin-top:8px;font-weight:800}.q-feedback.show{display:block}
                .quiz-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
                .quiz-action{flex:1;min-width:150px;padding:12px;border-radius:13px;border:1px solid rgba(229,200,120,.35);font-family:inherit;font-weight:900;cursor:pointer}
                .check-btn{background:#b78b32;color:#111}.check-btn:disabled{opacity:.65;cursor:not-allowed}
                .quiz-result{margin-top:12px;padding:12px;border-radius:13px;background:rgba(183,139,50,.1);color:#eadfcd;font-weight:900;text-align:center;display:none}
                .quiz-result.show{display:block}
            </style>

            <div class="lec-profile">
                ${lecture.speakerImg ? `<img src="${esc(lecture.speakerImg)}" alt="${esc(lecture.speaker)}">` : ''}
                <h5>${esc(lecture.speaker)}</h5>
            </div>

            <div class="summary">${esc(lecture.summary)}</div>

            <h6 style="color:#e5c878;font-weight:900">محاور المحاضرة</h6>
            ${topics}

            <button class="quiz-toggle" id="quizToggle" type="button">
                <i class="bi bi-patch-question-fill"></i> أسئلة المحاضرة التفاعلية
            </button>

            ${buildQuiz(lecture)}
        `;

        const toggle = document.getElementById('quizToggle');
        const quizBox = document.getElementById('quizBox');
        const checkButton = document.getElementById('checkQuiz');

        if (toggle && quizBox) {
            toggle.addEventListener('click', () => {
                quizBox.hidden = !quizBox.hidden;
            });
        }

        if (checkButton) {
            checkButton.addEventListener('click', () => checkQuiz(lecture));
        }

        if (window.bootstrap) {
            const instance = bootstrap.Modal.getInstance(modal) || new bootstrap.Modal(modal);
            instance.show();
        }

        // افتح النافذة أولًا، ثم افحص حالة المحاولة بدون تعطيل واجهة المستخدم.
        await refreshSubmissionStatus(lecture);
    }

    function readAnswers(lecture) {
        const answers = [];
        const elements = document.querySelectorAll('#quizBox .interactive-q');

        elements.forEach(element => {
            const type = element.dataset.type;
            let value = '';

            if (type === 'أكمل') {
                value = element.querySelector('.fill-answer')?.value || '';
            } else {
                value = element.querySelector('input:checked')?.value || '';
            }

            answers.push({
                element,
                type,
                answer: element.dataset.answer || '',
                value
            });
        });

        return answers;
    }

    function evaluateAnswer(type, value, answer) {
        if (!value) return false;

        if (type === 'أكمل') {
            return isTextCorrect(value, answer);
        }

        if (type === 'صح أم خطأ') {
            return norm(value) === norm(answer);
        }

        return String(answer).trim() === String(value).trim();
    }

    async function checkQuiz(lecture) {
        if (submitting) return;

        const questions = Array.isArray(lecture.quiz) ? lecture.quiz : [];
        const result = document.getElementById('quizResult');
        const checkButton = document.getElementById('checkQuiz');

        if (!result || !checkButton) return;

        if (!window.YCScoring) {
            result.textContent = 'تعذر تشغيل نظام الدرجات. يرجى إعادة تحميل الصفحة.';
            result.classList.add('show');
            return;
        }

        const answers = readAnswers(lecture);
        let score = 0;
        let answered = 0;

        answers.forEach(item => {
            const feedback = item.element.querySelector('.q-feedback');
            item.element.classList.remove('correct', 'wrong');
            feedback?.classList.remove('show');

            if (!item.value) return;

            answered += 1;

            const correct = evaluateAnswer(item.type, item.value, item.answer);

            if (correct) {
                score += 1;
                item.element.classList.add('correct');
                if (feedback) {
                    feedback.textContent = '✓ إجابة صحيحة';
                    feedback.style.color = '#4ade80';
                    feedback.classList.add('show');
                }
            } else {
                item.element.classList.add('wrong');
                if (feedback) {
                    feedback.textContent = '✗ إجابة غير صحيحة';
                    feedback.style.color = '#f87171';
                    feedback.classList.add('show');
                }
            }
        });

        result.textContent = `النتيجة: ${score} من ${questions.length} — تمت الإجابة عن ${answered} سؤال`;
        result.classList.add('show');

        submitting = true;
        checkButton.disabled = true;
        checkButton.textContent = 'جاري تسجيل الدرجة...';

        const category = lecture.day === 1 ? 'lecture1' : 'lecture2';
        const QUIZ_MAX = 15;
            const scaledScore = questions.length ? Math.round((score / questions.length) * QUIZ_MAX * 100) / 100 : 0;

        try {
            const response = await window.YCScoring.submitIndividual(category, scaledScore, QUIZ_MAX);

            if (response?.status === 'success') {
                result.innerHTML =
                    `تم تسجيل ${scaledScore}/15 للطالب <strong>${esc(window.YCScoring.personName())}</strong> — لا يمكن إعادة المحاولة من عندك.`;
                checkButton.textContent = '✓ تم التسجيل';
                setQuizLocked(result.textContent);
                return;
            }

            if (response?.status === 'already_submitted') {
                const savedScore = Number(response.score ?? 0);
                const savedMax = Number(response.max ?? max);
                result.innerHTML =
                    `الدرجة مسجلة بالفعل: <strong>${savedScore}/${savedMax}</strong> لهذا الاسم.`;
                setQuizLocked(result.textContent);
                return;
            }

            throw new Error(response?.message || 'تعذر حفظ الدرجة.');
        } catch (error) {
            submitting = false;
            checkButton.disabled = false;
            checkButton.innerHTML = '<i class="bi bi-check2-circle"></i> تحقق من الإجابات';

            result.innerHTML =
                `${esc(`النتيجة: ${score} من ${questions.length} — تمت الإجابة عن ${answered} سؤال`)}<br>
                 <span style="color:#f87171">لم يتم حفظ الدرجة: ${esc(error?.message || 'خطأ غير معروف')}</span>`;
            result.classList.add('show');
        }
    }

    function render() {
        [1, 2].forEach(day => {
            const panel = document.getElementById('panel-day-' + day);
            if (!panel) return;

            panel.innerHTML = '';

            lectures
                .filter(lecture => Number(lecture.day) === day)
                .forEach(lecture => panel.appendChild(lectureCard(lecture)));
        });
    }

    function init() {
        lectures = Array.isArray(window.lectures) ? window.lectures : [];

        if (!lectures.length) {
            console.warn('lectures.js: لا توجد بيانات محاضرات في window.lectures');
        }

        render();

        document.querySelectorAll('.day-tab').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.day-tab').forEach(item => item.classList.remove('active'));
                document.querySelectorAll('.day-panel').forEach(item => item.classList.remove('active'));

                button.classList.add('active');

                const panel = document.getElementById('panel-day-' + button.dataset.day);
                if (panel) panel.classList.add('active');
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
