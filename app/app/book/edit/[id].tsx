import { useLocalSearchParams } from 'expo-router';

import { BookFormScreen } from '../../../src/books/BookFormScreen';

// Edit or delete a book: `/book/edit/<id>`.
export default function EditBookRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BookFormScreen key={id} bookId={id} />;
}
