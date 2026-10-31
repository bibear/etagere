import { useLocalSearchParams } from 'expo-router';

import { BookFormScreen } from '../../src/books/BookFormScreen';

// Add a book by hand: `/book/new`, or `/book/new?isbn=…` to prefill the ISBN.
export default function NewBookRoute() {
  const { isbn } = useLocalSearchParams<{ isbn?: string }>();
  return <BookFormScreen initialIsbn={typeof isbn === 'string' ? isbn : undefined} />;
}
