"use client";
import React, { useState } from "react";
import { Send, CheckCircle } from "lucide-react";

export default function ContactForm() {
  const [formState, setFormState] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    setFormState((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await new Promise((res) => setTimeout(res, 800));
    setSubmitting(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="text-center py-10">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: "var(--success-bg)" }}
        >
          <CheckCircle
            className="w-8 h-8"
            style={{ color: "var(--success-text)" }}
          />
        </div>
        <h3
          className="text-xl font-bold mb-2"
          style={{ color: "var(--foreground)" }}
        >
          Message Sent!
        </h3>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--muted-foreground)" }}
        >
          Thank you for getting in touch. We&apos;ll get back to you as soon as
          possible, usually within one business day.
        </p>
        <button
          className="mt-6 text-sm font-medium transition-opacity hover:opacity-70"
          style={{ color: "var(--accent)" }}
          onClick={() => {
            setSubmitted(false);
            setFormState({ name: "", email: "", subject: "", message: "" });
          }}
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <>
      <h2
        className="text-xl font-semibold mb-6"
        style={{ color: "var(--foreground)" }}
      >
        Send us a Message
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--foreground)" }}
            >
              Full Name{" "}
              <span style={{ color: "var(--destructive)" }}>*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              value={formState.name}
              onChange={handleChange}
              placeholder="Your name"
              className="w-full px-3.5 py-2.5 rounded-lg text-sm border transition-colors outline-none"
              style={{
                background: "var(--background)",
                color: "var(--foreground)",
                borderColor: "var(--sidebar-border)",
              }}
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--foreground)" }}
            >
              Email Address{" "}
              <span style={{ color: "var(--destructive)" }}>*</span>
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              value={formState.email}
              onChange={handleChange}
              placeholder="your@email.com"
              className="w-full px-3.5 py-2.5 rounded-lg text-sm border transition-colors outline-none"
              style={{
                background: "var(--background)",
                color: "var(--foreground)",
                borderColor: "var(--sidebar-border)",
              }}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="subject"
            className="block text-sm font-medium mb-1.5"
            style={{ color: "var(--foreground)" }}
          >
            Subject{" "}
            <span style={{ color: "var(--destructive)" }}>*</span>
          </label>
          <select
            id="subject"
            name="subject"
            required
            value={formState.subject}
            onChange={handleChange}
            className="w-full px-3.5 py-2.5 rounded-lg text-sm border transition-colors outline-none"
            style={{
              background: "var(--background)",
              color: "var(--foreground)",
              borderColor: "var(--sidebar-border)",
            }}
          >
            <option value="">Select a topic…</option>
            <option value="order">Order Query</option>
            <option value="product">Product Question</option>
            <option value="delivery">Delivery / Shipping</option>
            <option value="return">Returns / Refunds</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="message"
            className="block text-sm font-medium mb-1.5"
            style={{ color: "var(--foreground)" }}
          >
            Message{" "}
            <span style={{ color: "var(--destructive)" }}>*</span>
          </label>
          <textarea
            id="message"
            name="message"
            rows={5}
            required
            value={formState.message}
            onChange={handleChange}
            placeholder="How can we help you?"
            className="w-full px-3.5 py-2.5 rounded-lg text-sm border transition-colors outline-none resize-none"
            style={{
              background: "var(--background)",
              color: "var(--foreground)",
              borderColor: "var(--sidebar-border)",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-semibold transition-all duration-200 hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
          style={{ background: "var(--primary)", color: "white" }}
        >
          {submitting ? (
            <>
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Sending…
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Send Message
            </>
          )}
        </button>
      </form>
    </>
  );
}
