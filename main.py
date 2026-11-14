"""Quizbowl Trainer - fine arts tossup/bonus buzzer practice."""
import json
import os
import re
import sys
import random
import webbrowser
import urllib.parse
import winsound
import tkinter as tk
from tkinter import font as tkfont


def app_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def resource_path(name):
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, name)
    return os.path.join(app_dir(), name)


STATS_PATH = os.path.join(app_dir(), "stats.json")

ARTICLE_RE = re.compile(r"^(the|a|an)\s+")
PUNCT_RE = re.compile(r"[^\w\s]")


def normalize(s):
    s = s.lower().strip()
    s = PUNCT_RE.sub("", s)
    s = ARTICLE_RE.sub("", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def answer_matches(user_text, answer, accepts):
    norm_user = normalize(user_text)
    if not norm_user:
        return False
    candidates = [answer] + list(accepts or [])
    for cand in candidates:
        norm_c = normalize(cand)
        if not norm_c:
            continue
        if norm_user == norm_c:
            return True
        words = norm_c.split()
        if len(words) > 1 and norm_user == words[-1]:
            return True
        if len(norm_user) >= 4 and (norm_user in norm_c or norm_c in norm_user):
            return True
    return False


def load_questions():
    with open(resource_path("questions.json"), "r", encoding="utf-8") as f:
        return json.load(f)


def load_ear_training():
    with open(resource_path("ear_training.json"), "r", encoding="utf-8") as f:
        return json.load(f)


def youtube_search_url(query):
    return "https://www.youtube.com/results?search_query=" + urllib.parse.quote_plus(query)


def local_clip_path(part_id):
    if not part_id:
        return None
    path = resource_path(os.path.join("audio", part_id + ".wav"))
    return path if os.path.exists(path) else None


PITCH_CLASS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def _note_tokens_to_pitch_classes(text):
    tokens = [t for t in re.split(r"[\s,\-]+", text.strip()) if t]
    pcs = []
    for tok in tokens:
        tok = tok.strip()
        if not tok:
            continue
        letter = tok[0].upper()
        if letter not in PITCH_CLASS:
            continue
        rest = tok[1:].lower()
        acc = 0
        if rest.startswith("#") or rest.startswith("s"):
            acc = 1
        elif rest.startswith("b") or rest.startswith("f"):
            acc = -1
        pcs.append((PITCH_CLASS[letter] + acc) % 12)
    return pcs


def notes_match(user_text, answer_notes):
    """Returns True/False, or None if answer_notes has no literal pitch sequence to check."""
    if "(" in answer_notes:
        return None
    ans_pcs = _note_tokens_to_pitch_classes(answer_notes)
    user_pcs = _note_tokens_to_pitch_classes(user_text)
    if not ans_pcs or not user_pcs:
        return False if user_text.strip() else None
    n = min(len(user_pcs), len(ans_pcs))
    return n > 0 and user_pcs[:n] == ans_pcs[:n]


def load_stats():
    default = {
        "tossups_seen": 0, "powers": 0, "tens": 0, "negs": 0,
        "end_correct": 0, "end_wrong": 0, "points": 0,
        "buzz_fraction_sum": 0.0, "buzz_count": 0,
        "bonus_parts_seen": 0, "bonus_parts_correct": 0, "bonus_points": 0,
        "ear_seen": 0, "ear_correct": 0,
    }
    if os.path.exists(STATS_PATH):
        try:
            with open(STATS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            default.update(data)
        except Exception:
            pass
    return default


def save_stats(stats):
    try:
        with open(STATS_PATH, "w", encoding="utf-8") as f:
            json.dump(stats, f, indent=2)
    except Exception:
        pass


BG = "#101418"
PANEL = "#181e26"
FG = "#e8ecf1"
MUTED = "#8b97a7"
ACCENT = "#4fc3f7"
GOOD = "#66d17a"
BAD = "#ef5959"
GOLD = "#f0c14b"


class QuizBowlApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Quizbowl Trainer - Fine Arts")
        self.geometry("900x640")
        self.configure(bg=BG)
        self.minsize(760, 560)

        self.data = load_questions()
        self.ear_data = load_ear_training()
        self.stats = load_stats()

        self.big_font = tkfont.Font(family="Georgia", size=17)
        self.ui_font = tkfont.Font(family="Segoe UI", size=11)
        self.ui_font_b = tkfont.Font(family="Segoe UI", size=11, weight="bold")
        self.head_font = tkfont.Font(family="Segoe UI", size=22, weight="bold")
        self.small_font = tkfont.Font(family="Segoe UI", size=9)

        self.reveal_ms = tk.IntVar(value=230)

        self.container = tk.Frame(self, bg=BG)
        self.container.pack(fill="both", expand=True)

        self.frames = {}
        for F in (MenuFrame, TossupFrame, BonusFrame, EarTrainingFrame, StatsFrame):
            frame = F(self.container, self)
            self.frames[F.__name__] = frame
            frame.place(relx=0, rely=0, relwidth=1, relheight=1)

        self.show("MenuFrame")
        self.protocol("WM_DELETE_WINDOW", self.on_close)

    def show(self, name):
        frame = self.frames[name]
        frame.tkraise()
        if hasattr(frame, "on_show"):
            frame.on_show()

    def on_close(self):
        save_stats(self.stats)
        self.destroy()


class MenuFrame(tk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent, bg=BG)
        self.app = app

        tk.Label(self, text="Quizbowl Trainer", font=app.head_font, bg=BG, fg=FG).pack(pady=(60, 4))
        tk.Label(self, text="Fine Arts — Painting, Sculpture, Music, Architecture",
                 font=app.ui_font, bg=BG, fg=MUTED).pack(pady=(0, 40))

        btn_opts = dict(font=app.ui_font_b, width=28, height=2, bd=0,
                         activebackground=ACCENT, cursor="hand2")

        tk.Button(self, text="Tossups (buzz practice)", bg=ACCENT, fg="#08202b",
                   command=lambda: app.show("TossupFrame"), **btn_opts).pack(pady=8)
        tk.Button(self, text="Bonuses", bg="#3a4a5a", fg=FG,
                   command=lambda: app.show("BonusFrame"), **btn_opts).pack(pady=8)
        tk.Button(self, text="Ear Training (audio incipits)", bg="#3a4a5a", fg=FG,
                   command=lambda: app.show("EarTrainingFrame"), **btn_opts).pack(pady=8)
        tk.Button(self, text="Session Stats", bg="#3a4a5a", fg=FG,
                   command=lambda: app.show("StatsFrame"), **btn_opts).pack(pady=8)

        speed_frame = tk.Frame(self, bg=BG)
        speed_frame.pack(pady=(50, 0))
        tk.Label(speed_frame, text="Read speed (ms / word):", font=app.small_font,
                  bg=BG, fg=MUTED).pack(side="left", padx=(0, 8))
        tk.Scale(speed_frame, from_=80, to=500, orient="horizontal", length=220,
                  variable=app.reveal_ms, bg=BG, fg=MUTED, troughcolor=PANEL,
                  highlightthickness=0, bd=0, font=app.small_font).pack(side="left")

        tk.Label(self, text="Space / Buzz button = buzz in    |    Enter = submit answer",
                  font=app.small_font, bg=BG, fg=MUTED).pack(pady=(30, 0))


class TossupFrame(tk.Frame):
    STATE_IDLE, STATE_READING, STATE_BUZZED, STATE_DONE = range(4)

    def __init__(self, parent, app):
        super().__init__(parent, bg=BG)
        self.app = app
        self.state = self.STATE_IDLE
        self.pool = []
        self.words = []
        self.power_index = None
        self.word_i = 0
        self.after_id = None
        self.current_q = None

        top = tk.Frame(self, bg=BG)
        top.pack(fill="x", padx=24, pady=(18, 6))
        tk.Button(top, text="← Menu", font=app.ui_font, bg=PANEL, fg=FG, bd=0,
                   command=self.to_menu, cursor="hand2").pack(side="left")
        self.cat_label = tk.Label(top, text="", font=app.ui_font_b, bg=BG, fg=ACCENT)
        self.cat_label.pack(side="left", padx=16)
        self.status_label = tk.Label(top, text="", font=app.ui_font_b, bg=BG, fg=MUTED)
        self.status_label.pack(side="right")

        card = tk.Frame(self, bg=PANEL)
        card.pack(fill="both", expand=True, padx=24, pady=8)
        self.text_widget = tk.Text(card, wrap="word", font=app.big_font, bg=PANEL, fg=FG,
                                     bd=0, padx=24, pady=24, state="disabled",
                                     insertbackground=FG, highlightthickness=0)
        self.text_widget.pack(fill="both", expand=True)
        self.text_widget.tag_configure("good", foreground=GOOD)
        self.text_widget.tag_configure("bad", foreground=BAD)
        self.text_widget.tag_configure("power", foreground=GOLD)

        bottom = tk.Frame(self, bg=BG)
        bottom.pack(fill="x", padx=24, pady=(4, 18))

        self.buzz_btn = tk.Button(bottom, text="BUZZ (space)", font=app.ui_font_b,
                                    bg=BAD, fg="white", bd=0, height=2, width=16,
                                    cursor="hand2", command=self.buzz)
        self.buzz_btn.pack(side="left")

        self.answer_var = tk.StringVar()
        self.answer_entry = tk.Entry(bottom, textvariable=self.answer_var, font=app.ui_font,
                                       bg="#0c1116", fg=FG, insertbackground=FG, bd=0,
                                       relief="flat")
        self.answer_entry.pack(side="left", fill="x", expand=True, padx=12, ipady=8)
        self.answer_entry.bind("<Return>", lambda e: self.submit_answer())

        self.submit_btn = tk.Button(bottom, text="Submit", font=app.ui_font_b,
                                      bg=ACCENT, fg="#08202b", bd=0, height=2, width=10,
                                      cursor="hand2", command=self.submit_answer)
        self.submit_btn.pack(side="left")

        self.next_btn = tk.Button(bottom, text="Next →", font=app.ui_font_b,
                                    bg="#3a4a5a", fg=FG, bd=0, height=2, width=10,
                                    cursor="hand2", command=self.next_question)

        self.bind_all("<space>", self._space_handler)

        self.set_controls_for_state()

    def to_menu(self):
        self.cancel_timer()
        self.app.show("MenuFrame")

    def _space_handler(self, event):
        if self.winfo_ismapped() and self.state == self.STATE_READING:
            if not isinstance(event.widget, tk.Entry):
                self.buzz()
                return "break"

    def on_show(self):
        self.next_question()

    def cancel_timer(self):
        if self.after_id is not None:
            try:
                self.after_cancel(self.after_id)
            except Exception:
                pass
            self.after_id = None

    def next_question(self):
        self.cancel_timer()
        if not self.pool:
            self.pool = list(range(len(self.app.data["tossups"])))
            random.shuffle(self.pool)
        idx = self.pool.pop()
        self.current_q = self.app.data["tossups"][idx]

        raw = self.current_q["text"]
        tokens = raw.split()
        self.power_index = None
        clean = []
        for tok in tokens:
            if tok == "(*)":
                self.power_index = len(clean)
                continue
            clean.append(tok)
        self.words = clean

        self.cat_label.config(text=self.current_q["category"])
        self.status_label.config(text="", fg=MUTED)
        self.answer_var.set("")
        self.next_btn.pack_forget()

        self.text_widget.config(state="normal")
        self.text_widget.delete("1.0", "end")
        self.text_widget.config(state="disabled")

        self.word_i = 0
        self.state = self.STATE_READING
        self.set_controls_for_state()
        self._reveal_step()

    def _reveal_step(self):
        if self.state != self.STATE_READING:
            return
        if self.word_i >= len(self.words):
            self.state = self.STATE_DONE
            self.status_label.config(text="End of question", fg=MUTED)
            self.set_controls_for_state()
            self.answer_entry.focus_set()
            return
        word = self.words[self.word_i]
        self.word_i += 1
        self.text_widget.config(state="normal")
        tag = "power" if (self.power_index is not None and self.word_i == self.power_index + 1) else None
        prefix = "" if self.text_widget.index("end-1c") == "1.0" else " "
        if tag:
            self.text_widget.insert("end", prefix + word, tag)
        else:
            self.text_widget.insert("end", prefix + word)
        self.text_widget.see("end")
        self.text_widget.config(state="disabled")
        self.after_id = self.after(self.app.reveal_ms.get(), self._reveal_step)

    def buzz(self):
        if self.state != self.STATE_READING:
            return
        self.cancel_timer()
        self.state = self.STATE_BUZZED
        before_power = self.power_index is not None and self.word_i <= self.power_index
        label = "BUZZED — in power!" if before_power else "BUZZED"
        self.status_label.config(text=label, fg=GOLD if before_power else ACCENT)
        self.set_controls_for_state()
        self.answer_entry.focus_set()

    def submit_answer(self):
        if self.state not in (self.STATE_BUZZED, self.STATE_DONE):
            return
        user = self.answer_var.get()
        correct = answer_matches(user, self.current_q["answer"], self.current_q.get("accept"))
        s = self.app.stats
        s["tossups_seen"] += 1

        if self.state == self.STATE_BUZZED:
            before_power = self.power_index is not None and self.word_i <= self.power_index
            frac = self.word_i / max(1, len(self.words))
            s["buzz_fraction_sum"] += frac
            s["buzz_count"] += 1
            if correct:
                pts = 15 if before_power else 10
                if before_power:
                    s["powers"] += 1
                else:
                    s["tens"] += 1
                s["points"] += pts
                self.flash_result(True, pts)
            else:
                s["negs"] += 1
                s["points"] -= 5
                self.flash_result(False, -5)
        else:
            if correct:
                s["end_correct"] += 1
                s["points"] += 10
                self.flash_result(True, 10)
            else:
                s["end_wrong"] += 1
                self.flash_result(False, 0)

        save_stats(s)
        self.reveal_remaining()
        self.state = self.STATE_DONE
        self.set_controls_for_state()

    def flash_result(self, correct, pts):
        txt = f"{'CORRECT' if correct else 'INCORRECT'}  ({pts:+d})  Answer: {self.current_q['answer']}"
        self.status_label.config(text=txt, fg=GOOD if correct else BAD)

    def reveal_remaining(self):
        if self.word_i < len(self.words):
            rest = " ".join(self.words[self.word_i:])
            self.text_widget.config(state="normal")
            self.text_widget.insert("end", " " + rest)
            self.text_widget.config(state="disabled")
            self.word_i = len(self.words)

    def set_controls_for_state(self):
        if self.state == self.STATE_READING:
            self.buzz_btn.config(state="normal")
            self.submit_btn.config(state="disabled")
            self.answer_entry.config(state="disabled")
            self.next_btn.pack_forget()
        elif self.state in (self.STATE_BUZZED, self.STATE_DONE):
            self.buzz_btn.config(state="disabled")
            self.submit_btn.config(state="normal")
            self.answer_entry.config(state="normal")
        if self.state == self.STATE_DONE and self.answer_var.get() == "" and \
           self.status_label.cget("text") not in ("End of question",):
            pass

    def submit_or_skip_done(self):
        pass


class BonusFrame(tk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent, bg=BG)
        self.app = app
        self.pool = []
        self.current = None
        self.part_i = 0

        top = tk.Frame(self, bg=BG)
        top.pack(fill="x", padx=24, pady=(18, 6))
        tk.Button(top, text="← Menu", font=app.ui_font, bg=PANEL, fg=FG, bd=0,
                   command=lambda: app.show("MenuFrame"), cursor="hand2").pack(side="left")
        self.cat_label = tk.Label(top, text="", font=app.ui_font_b, bg=BG, fg=ACCENT)
        self.cat_label.pack(side="left", padx=16)
        self.progress_label = tk.Label(top, text="", font=app.ui_font_b, bg=BG, fg=MUTED)
        self.progress_label.pack(side="right")

        self.leadin_label = tk.Label(self, text="", font=app.ui_font, bg=BG, fg=MUTED,
                                       wraplength=820, justify="left")
        self.leadin_label.pack(fill="x", padx=24, pady=(6, 0))

        card = tk.Frame(self, bg=PANEL)
        card.pack(fill="both", expand=True, padx=24, pady=8)
        self.clue_label = tk.Label(card, text="", font=app.big_font, bg=PANEL, fg=FG,
                                     wraplength=800, justify="left")
        self.clue_label.pack(fill="both", expand=True, padx=24, pady=24)

        self.result_label = tk.Label(self, text="", font=app.ui_font_b, bg=BG, fg=MUTED)
        self.result_label.pack(fill="x", padx=24)

        bottom = tk.Frame(self, bg=BG)
        bottom.pack(fill="x", padx=24, pady=(4, 18))
        self.answer_var = tk.StringVar()
        self.answer_entry = tk.Entry(bottom, textvariable=self.answer_var, font=app.ui_font,
                                       bg="#0c1116", fg=FG, insertbackground=FG, bd=0)
        self.answer_entry.pack(side="left", fill="x", expand=True, ipady=8)
        self.answer_entry.bind("<Return>", lambda e: self.submit())
        self.submit_btn = tk.Button(bottom, text="Submit", font=app.ui_font_b,
                                      bg=ACCENT, fg="#08202b", bd=0, height=2, width=10,
                                      cursor="hand2", command=self.submit)
        self.submit_btn.pack(side="left", padx=(12, 0))
        self.next_btn = tk.Button(bottom, text="Next part →", font=app.ui_font_b,
                                    bg="#3a4a5a", fg=FG, bd=0, height=2, width=12,
                                    cursor="hand2", command=self.next_part)

    def on_show(self):
        self.new_bonus()

    def new_bonus(self):
        if not self.pool:
            self.pool = list(range(len(self.app.data["bonuses"])))
            random.shuffle(self.pool)
        idx = self.pool.pop()
        self.current = self.app.data["bonuses"][idx]
        self.part_i = 0
        self.bonus_score = 0
        self.cat_label.config(text=self.current["category"])
        self.leadin_label.config(text=self.current["leadin"])
        self.result_label.config(text="")
        self.show_part()

    def show_part(self):
        parts = self.current["parts"]
        self.progress_label.config(text=f"Part {self.part_i + 1} / {len(parts)}   |   Bonus score: {self.bonus_score}")
        self.clue_label.config(text=parts[self.part_i]["clue"])
        self.answer_var.set("")
        self.result_label.config(text="")
        self.next_btn.pack_forget()
        self.submit_btn.config(state="normal")
        self.answer_entry.config(state="normal")
        self.answer_entry.focus_set()

    def submit(self):
        part = self.current["parts"][self.part_i]
        user = self.answer_var.get()
        correct = answer_matches(user, part["answer"], part.get("accept"))
        s = self.app.stats
        s["bonus_parts_seen"] += 1
        if correct:
            s["bonus_parts_correct"] += 1
            s["bonus_points"] += 10
            self.bonus_score += 10
            self.result_label.config(text=f"CORRECT  Answer: {part['answer']}", fg=GOOD)
        else:
            self.result_label.config(text=f"INCORRECT  Answer: {part['answer']}", fg=BAD)
        save_stats(s)
        self.submit_btn.config(state="disabled")
        self.answer_entry.config(state="disabled")
        if self.part_i + 1 < len(self.current["parts"]):
            self.next_btn.config(text="Next part →", command=self.next_part)
        else:
            self.next_btn.config(text="New bonus →", command=self.new_bonus)
        self.next_btn.pack(side="left", padx=(12, 0))

    def next_part(self):
        self.part_i += 1
        self.show_part()


class EarTrainingFrame(tk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent, bg=BG)
        self.app = app
        self.pool = []
        self.work = None
        self.part = None

        top = tk.Frame(self, bg=BG)
        top.pack(fill="x", padx=24, pady=(18, 6))
        tk.Button(top, text="← Menu", font=app.ui_font, bg=PANEL, fg=FG, bd=0,
                   command=lambda: app.show("MenuFrame"), cursor="hand2").pack(side="left")
        tk.Label(top, text="Ear Training", font=app.ui_font_b, bg=BG, fg=ACCENT).pack(side="left", padx=16)

        tk.Label(self, text="Listen blind, then guess the piece (and composer) — and if you can, "
                              "the first few notes. The answer only shows after you submit.",
                  font=app.small_font, bg=BG, fg=MUTED, wraplength=820, justify="left").pack(
                      fill="x", padx=24, pady=(0, 6))

        card = tk.Frame(self, bg=PANEL)
        card.pack(fill="both", expand=True, padx=24, pady=8)

        self.status_label = tk.Label(card, text="", font=app.ui_font_b, bg=PANEL, fg=ACCENT,
                                       wraplength=800, justify="left")
        self.status_label.pack(fill="x", padx=24, pady=(20, 4), anchor="w")

        self.hint_label = tk.Label(card, text="", font=app.big_font, bg=PANEL, fg=FG,
                                     wraplength=800, justify="left")
        self.hint_label.pack(fill="both", expand=True, padx=24, pady=8, anchor="w")

        self.play_btn = tk.Button(card, text="▶ Play clip", font=app.ui_font_b,
                                    bg=ACCENT, fg="#08202b", bd=0, height=2, cursor="hand2",
                                    command=self.open_clip)
        self.play_btn.pack(padx=24, pady=(0, 20), anchor="w")

        self.result_label = tk.Label(self, text="", font=app.ui_font_b, bg=BG, fg=MUTED,
                                       wraplength=820, justify="left")
        self.result_label.pack(fill="x", padx=24)

        bottom = tk.Frame(self, bg=BG)
        bottom.pack(fill="x", padx=24, pady=(4, 6))
        tk.Label(bottom, text="Piece / composer:", font=app.small_font, bg=BG, fg=MUTED,
                  width=16, anchor="w").pack(side="left")
        self.answer_var = tk.StringVar()
        self.answer_entry = tk.Entry(bottom, textvariable=self.answer_var, font=app.ui_font,
                                       bg="#0c1116", fg=FG, insertbackground=FG, bd=0)
        self.answer_entry.pack(side="left", fill="x", expand=True, ipady=8)
        self.answer_entry.bind("<Return>", lambda e: self.notes_entry.focus_set())

        notes_row = tk.Frame(self, bg=BG)
        notes_row.pack(fill="x", padx=24, pady=(4, 6))
        tk.Label(notes_row, text="Notes (optional):", font=app.small_font, bg=BG, fg=MUTED,
                  width=16, anchor="w").pack(side="left")
        self.notes_var = tk.StringVar()
        self.notes_entry = tk.Entry(notes_row, textvariable=self.notes_var, font=app.ui_font,
                                      bg="#0c1116", fg=FG, insertbackground=FG, bd=0)
        self.notes_entry.pack(side="left", fill="x", expand=True, ipady=8)
        self.notes_entry.bind("<Return>", lambda e: self.submit())

        action_row = tk.Frame(self, bg=BG)
        action_row.pack(fill="x", padx=24, pady=(4, 18))
        self.submit_btn = tk.Button(action_row, text="Submit", font=app.ui_font_b,
                                      bg=ACCENT, fg="#08202b", bd=0, height=2, width=10,
                                      cursor="hand2", command=self.submit)
        self.submit_btn.pack(side="left")
        self.next_btn = tk.Button(action_row, text="Next →", font=app.ui_font_b,
                                    bg="#3a4a5a", fg=FG, bd=0, height=2, width=10,
                                    cursor="hand2", command=self.next_clip)

    def on_show(self):
        self.next_clip()

    def next_clip(self):
        if not self.pool:
            works = self.app.ear_data["works"]
            self.pool = [(wi, pi) for wi, w in enumerate(works) for pi in range(len(w["parts"]))]
            random.shuffle(self.pool)
        wi, pi = self.pool.pop()
        self.work = self.app.ear_data["works"][wi]
        self.part = self.work["parts"][pi]
        self.local_path = local_clip_path(self.part.get("id"))

        self.status_label.config(
            text=("🎧 Blind clip — no browser tabs, no spoilers" if self.local_path
                  else "🔍 Browser search clip — heads up, the search results may show the title"),
            fg=ACCENT)
        self.play_btn.config(text="▶ Play clip" if self.local_path else "▶ Open clip search in browser")
        self.hint_label.config(text="")
        self.result_label.config(text="", fg=MUTED)
        self.answer_var.set("")
        self.notes_var.set("")
        self.next_btn.pack_forget()
        self.submit_btn.config(state="normal")
        self.answer_entry.config(state="normal")
        self.notes_entry.config(state="normal")
        self.answer_entry.focus_set()

    def open_clip(self):
        if self.local_path:
            winsound.PlaySound(self.local_path, winsound.SND_FILENAME | winsound.SND_ASYNC)
        else:
            webbrowser.open(youtube_search_url(self.part["search"]))

    def submit(self):
        user = self.answer_var.get()
        accept = list(self.work.get("accept", [])) + [self.work["composer"]]
        correct = answer_matches(user, self.work["piece"], accept)
        s = self.app.stats
        s["ear_seen"] += 1

        label = f"{self.work['composer']} — {self.work['piece']} ({self.part['name']})"
        lines = [("CORRECT  —  " if correct else "Answer: ") + label]

        nm = notes_match(self.notes_var.get(), self.part.get("notes", ""))
        if nm is True:
            lines.append(f"Notes: ✓ close enough  —  {self.part['notes']}")
        elif nm is False:
            lines.append(f"Notes: not quite  —  actual: {self.part.get('notes', '?')}")

        if correct:
            s["ear_correct"] += 1
            self.result_label.config(text="\n".join(lines), fg=GOOD)
        else:
            self.result_label.config(text="\n".join(lines), fg=BAD)
        self.status_label.config(text=label, fg=ACCENT)
        self.hint_label.config(text=self.part["hint"])
        save_stats(s)
        self.submit_btn.config(state="disabled")
        self.answer_entry.config(state="disabled")
        self.notes_entry.config(state="disabled")
        self.next_btn.pack(side="left", padx=(12, 0))


class StatsFrame(tk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent, bg=BG)
        self.app = app

        top = tk.Frame(self, bg=BG)
        top.pack(fill="x", padx=24, pady=(18, 6))
        tk.Button(top, text="← Menu", font=app.ui_font, bg=PANEL, fg=FG, bd=0,
                   command=lambda: app.show("MenuFrame"), cursor="hand2").pack(side="left")
        tk.Label(top, text="Session Stats", font=app.ui_font_b, bg=BG, fg=ACCENT).pack(side="left", padx=16)

        reset_btn = tk.Button(top, text="Reset stats", font=app.small_font, bg=PANEL, fg=BAD, bd=0,
                                cursor="hand2", command=self.reset)
        reset_btn.pack(side="right")

        self.body = tk.Frame(self, bg=PANEL)
        self.body.pack(fill="both", expand=True, padx=24, pady=8)
        self.lines = []

    def on_show(self):
        for w in self.body.winfo_children():
            w.destroy()
        s = self.app.stats
        seen = s["tossups_seen"]
        heard = s["powers"] + s["tens"] + s["negs"]
        acc = (s["powers"] + s["tens"]) / heard * 100 if heard else 0.0
        avg_buzz = (s["buzz_fraction_sum"] / s["buzz_count"] * 100) if s["buzz_count"] else 0.0
        bonus_pct = (s["bonus_parts_correct"] / s["bonus_parts_seen"] * 100) if s["bonus_parts_seen"] else 0.0

        rows = [
            ("Tossups seen", seen),
            ("Powers (buzzed early & correct)", s["powers"]),
            ("Tens (buzzed & correct)", s["tens"]),
            ("Negs (buzzed & wrong)", s["negs"]),
            ("Correct only at end of Q", s["end_correct"]),
            ("Wrong / no answer at end", s["end_wrong"]),
            ("Buzz accuracy (of times you buzzed)", f"{acc:.1f}%"),
            ("Avg. buzz point (% of question read)", f"{avg_buzz:.1f}%"),
            ("Tossup points", s["points"]),
            ("", ""),
            ("Bonus parts seen", s["bonus_parts_seen"]),
            ("Bonus parts correct", s["bonus_parts_correct"]),
            ("Bonus conversion", f"{bonus_pct:.1f}%"),
            ("Bonus points", s["bonus_points"]),
            ("", ""),
            ("Ear training clips heard", s["ear_seen"]),
            ("Ear training correct", s["ear_correct"]),
            ("Ear training accuracy", f"{(s['ear_correct'] / s['ear_seen'] * 100) if s['ear_seen'] else 0.0:.1f}%"),
            ("", ""),
            ("TOTAL POINTS", s["points"] + s["bonus_points"]),
        ]
        for label, val in rows:
            row = tk.Frame(self.body, bg=PANEL)
            row.pack(fill="x", padx=24, pady=3)
            tk.Label(row, text=label, font=self.app.ui_font, bg=PANEL, fg=MUTED, anchor="w").pack(side="left")
            tk.Label(row, text=str(val), font=self.app.ui_font_b, bg=PANEL, fg=FG, anchor="e").pack(side="right")

    def reset(self):
        self.app.stats = {
            "tossups_seen": 0, "powers": 0, "tens": 0, "negs": 0,
            "end_correct": 0, "end_wrong": 0, "points": 0,
            "buzz_fraction_sum": 0.0, "buzz_count": 0,
            "bonus_parts_seen": 0, "bonus_parts_correct": 0, "bonus_points": 0,
            "ear_seen": 0, "ear_correct": 0,
        }
        save_stats(self.app.stats)
        self.on_show()


if __name__ == "__main__":
    app = QuizBowlApp()
    app.mainloop()
