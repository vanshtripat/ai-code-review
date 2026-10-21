const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true // Index on user field for fast queries of user reviews
    },
    language: {
      type: String,
      required: [true, 'Language is required'],
      enum: {
        values: ['javascript', 'typescript', 'java', 'python', 'cpp', 'c'],
        message: '{VALUE} is not a supported programming language'
      },
      lowercase: true,
      trim: true
    },
    sourceCode: {
      type: String,
      required: [true, 'Source code is required'],
      maxlength: [50000, 'Source code cannot exceed 50,000 characters']
      // Note: We do NOT use trim here to preserve exact code indentation and newlines
    },
    focus: {
      type: String,
      required: [true, 'Review focus is required'],
      enum: {
        values: ['all', 'bugs', 'security', 'performance', 'code_quality'],
        message: '{VALUE} is not a valid review focus'
      },
      default: 'all',
      lowercase: true,
      trim: true
    },
    aiResult: {
      overallScore: Number,
      summary: String,
      strengths: [String],
      issues: [
        {
          title: String,
          category: {
            type: String,
            enum: ['bug', 'security', 'performance', 'code_quality', 'style', 'maintainability']
          },
          severity: {
            type: String,
            enum: ['critical', 'high', 'medium', 'low', 'info']
          },
          lineStart: Number,
          lineEnd: Number,
          explanation: String,
          whyItMatters: String,
          suggestion: String,
          suggestedCode: String
        }
      ],
      learningPoints: [String],
      analyzedAt: Date,
      // Which Gemini model performed the analysis (e.g. 'gemini-2.5-flash')
      modelUsed: String
    }
  },
  {
    timestamps: true
  }
);

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
