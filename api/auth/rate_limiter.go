package auth

import (
	"sync"
	"time"
)

// RateLimiter limits requests per ID.
type RateLimiter struct {
	mu     sync.Mutex
	hits   map[string][]time.Time
	limit  int
	window time.Duration
}

// NewRateLimiter constructs a RateLimiter.
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{hits: make(map[string][]time.Time), limit: limit, window: window}
}

// Allow reports whether the request is within limits.
func (r *RateLimiter) Allow(id string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	times := r.hits[id]
	idx := 0
	for ; idx < len(times); idx++ {
		if now.Sub(times[idx]) <= r.window {
			break
		}
	}
	times = times[idx:]
	if len(times) >= r.limit {
		r.hits[id] = times
		return false
	}
	r.hits[id] = append(times, now)
	return true
}
