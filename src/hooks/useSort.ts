import * as React from 'react';
import { Direction, OnSortHandlerType, Sort } from '../types/Page';

export interface UsePolicySortReturn {
    sortBy: Sort | undefined;
    onSort: OnSortHandlerType;
}

export const useSort = (): UsePolicySortReturn => {

    const [ sortBy, setSortBy ] = React.useState<Sort>();

    const onSort = React.useCallback<OnSortHandlerType>((index: number, column: string, direction: Direction) => {
        setSortBy(Sort.by(column, direction));
    }, [ setSortBy ]);

    return {
        sortBy,
        onSort
    };
};
