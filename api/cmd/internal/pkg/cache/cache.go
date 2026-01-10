package cache

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

type Service struct {
	client *redis.Client
}

func New(client *redis.Client) *Service {
	return &Service{
		client: client,
	}
}

// WithCache tries to get data from Redis using `key`.
// If the key exists, it unmarshals the data into the return type T.
// If the key does not exist or error occurs, it executes `fetcher`.
// If `fetcher` succeeds, the result is stored in Redis with `expiration`.
func WithCache[T any](ctx context.Context, s *Service, key string, expiration time.Duration, fetcher func() (T, error)) (T, error) {
	var result T

	// 1. Try to get from cache
	val, err := s.client.Get(ctx, key).Result()
	if err == nil {
		// Cache hit
		if err := json.Unmarshal([]byte(val), &result); err == nil {
			return result, nil
		}
		// If unmarshal failed, we treat it as a miss and proceed to fetcher
	} else if err != redis.Nil {
		// Redis error (e.g. connection issue), log if necessary, but proceed to fetcher
		// In a production app you might want to log this error.
	}

	// 2. Fetch data (Cache miss or error)
	result, err = fetcher()
	if err != nil {
		return result, err
	}

	// 3. Set to cache
	// Marshal the result
	data, err := json.Marshal(result)
	if err == nil {
		// Set in Redis (fire and forget effectively, though Set returns a status)
		s.client.Set(ctx, key, data, expiration)
	}

	return result, nil
}

// Invalidate removes the specified key from the cache.
func (s *Service) Invalidate(ctx context.Context, key string) error {
	return s.client.Del(ctx, key).Err()
}
