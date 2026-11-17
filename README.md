# ML Lab Quiz Prep (UE24CS352A)

Practice site for the ML lab quiz: **253 one-mark MCQs** covering all 10 labs, each with an explanation.

**Live site:** https://ohhfarhaan.github.io/ML_Quiz_Platform/

## Study notes
- [notes.html](https://ohhfarhaan.github.io/ML_Quiz_Platform/notes.html): short summary of every lab, also available as `ML_Lab_Notes.pdf`.

## Modes
- **Mock quiz**: matches the real pattern. 20 questions (2 per lab), 30-minute timer, score scaled to 5, full review at the end.
- **Rapid practice**: all questions shuffled, with instant feedback.
- **Lab-by-lab practice**: drill a single lab.
- **Fix my mistakes**: retry the questions you last got wrong. Progress is saved in your browser.

## Labs covered
EDA & Data Quality · PyTorch Tensors · Decision Trees · Model Selection (kNN vs DT, Grid/Randomized Search) · Logistic Regression · ANN from scratch · Naive Bayes & Bayes Optimal Classifier · SVM · Hidden Markov Models · CNN (Rock-Paper-Scissors)

## Adding questions
Edit `questions.js`. Each entry is `[question, [CORRECT, wrong, wrong, wrong], explanation]`. The correct option goes first, and options are shuffled at runtime.
