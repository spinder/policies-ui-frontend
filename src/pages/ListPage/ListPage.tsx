import * as React from 'react';
import { useContext } from 'react';
import { PageSection } from '@patternfly/react-core';
import inBrowserDownload from 'in-browser-download';
import { Main, PageHeader, PageHeaderTitle, Section } from '@redhat-cloud-services/frontend-components';

import { PolicyRow, PolicyTable } from '../../components/Policy/Table/PolicyTable';
import { PolicyToolbar } from '../../components/Policy/TableToolbar/PolicyTableToolbar';
import { CreatePolicyWizard } from '../CreatePolicyWizard/CreatePolicyWizard';
import { AppContext } from '../../app/AppContext';
import { policyTableError } from './PolicyTableError';
import { ActionType } from '../../types/Policy';
import { DeletePolicy } from './DeletePolicy';
import { NewPolicy, Uuid } from '../../types/Policy/Policy';
import { usePolicyFilter, usePolicyPage, usePolicyRows } from '../../hooks';
import { useSort } from '../../hooks/useSort';
import { makeCopyOfPolicy } from '../../types/adapters/PolicyAdapter';
import { PolicyFilterColumn } from '../../types/Policy/PolicyPaging';
import { EmailOptIn } from '../../components/EmailOptIn/EmailOptIn';
import { Messages } from '../../properties/Messages';
import { style } from 'typestyle';
import { ListPageEmptyState } from './EmptyState';
import { usePrevious } from 'react-use';
import { useGetPoliciesQuery } from '../../services/useGetPolicies';
import { Page } from '../../types/Page';
import { policyExporterFactory } from '../../utils/exporters/Policy/Factory';
import { addDangerNotification } from '../../utils/AlertUtils';
import { format } from 'date-fns';
import { usePolicyToDelete } from '../../hooks/usePolicyToDelete';
import { useMassChangePolicyEnabledMutation } from '../../services/useMassChangePolicyEnabled';
import { useGetListPagePolicies } from './useGetListPagePolicies';
import { exporterTypeFromString } from '../../utils/exporters/Type';

type ListPageProps = {};

type PolicyWizardStateBase = {
    template: NewPolicy | undefined;
    showCreateStep: boolean;
    isEditing: boolean;
};

type PolicyWizardStateOpen = {
    isOpen: true;
} & PolicyWizardStateBase;

type PolicyWizardStateClosed = {
    isOpen: false;
} & Partial<PolicyWizardStateBase>;

type PolicyWizardState = PolicyWizardStateClosed | PolicyWizardStateOpen;

const emailOptinPageClassName = style({
    paddingBottom: 0
});

const ListPage: React.FunctionComponent<ListPageProps> = (_props) => {

    const [ policyWizardState, setPolicyWizardState ] = React.useState<PolicyWizardState>({
        isOpen: false
    });

    const changePolicyEnabledMutation = useMassChangePolicyEnabledMutation();
    const policyFilters = usePolicyFilter();
    const sort = useSort();
    const policyPage = usePolicyPage(policyFilters.debouncedFilters, undefined, sort.sortBy);
    const getPoliciesQuery = useGetListPagePolicies(policyPage.page);
    const { query: exportAllPoliciesQuery } = useGetPoliciesQuery(Page.of(
        0,
        Page.NO_SIZE,
        policyPage.page.filter,
        policyPage.page.sort
    ), false);
    const policyToDelete = usePolicyToDelete();
    const appContext = useContext(AppContext);

    let isLoading = getPoliciesQuery.loading || changePolicyEnabledMutation.loading;

    const policyRows = usePolicyRows(getPoliciesQuery.payload, isLoading, getPoliciesQuery.count, policyPage.page);
    const {
        rows: policyRowsRows,
        onSelect: policyRowsOnSelect,
        clearSelection,
        selectionCount,
        selected,
        getSelected,
        loadingSelected,
        removeSelection: policyRowsRemoveSelection
    } = policyRows;

    isLoading = isLoading || loadingSelected;

    const { canWriteAll, canReadAll } = appContext.rbac;

    const { query: getPoliciesQueryReload, count: getPoliciesQueryCount } = getPoliciesQuery;
    const { mutate: mutateChangePolicyEnabled, loading: loadingChangePolicyEnabled } = changePolicyEnabledMutation;

    const { changePage } = policyPage;
    const { index: currentPage, size: itemsPerPage } = policyPage.page;
    const { close: closePolicyToDelete, open: openPolicyToDelete, policy: singlePolicyToDelete } = policyToDelete;

    const prevLoadingChangePolicyEnabled = usePrevious(loadingChangePolicyEnabled);

    React.useEffect(() => {
        clearSelection();
    }, [ policyFilters.debouncedFilters, clearSelection ]);

    React.useEffect(() => {
        if (prevLoadingChangePolicyEnabled === true && !loadingChangePolicyEnabled) {
            getPoliciesQueryReload();
        }
    }, [ loadingChangePolicyEnabled, getPoliciesQueryReload, prevLoadingChangePolicyEnabled ]);

    const onDeleted = React.useCallback((policyId: Uuid) => {
        const index = policyRowsRows.findIndex(p => p.id === policyId);
        if (index === -1) {
            // The policy was not found on this page, but could be on other pages
            policyRowsRemoveSelection(policyId);
        } else {
            policyRowsOnSelect(policyRowsRows[index], index, false);
        }
    }, [ policyRowsRows, policyRowsOnSelect, policyRowsRemoveSelection ]);

    const onCloseDeletePolicy = React.useCallback((deleted: boolean) => {
        if (deleted) {
            getPoliciesQueryReload();

            const deletePolicyCount = singlePolicyToDelete ? 1 : selectionCount;

            const lastPage = Page.lastPageForElements(
                getPoliciesQueryCount - deletePolicyCount,
                itemsPerPage
            );

            if (lastPage.index < currentPage) {
                changePage(undefined, lastPage.index);
            }

            clearSelection();
        }

        closePolicyToDelete();
    }, [
        getPoliciesQueryReload, getPoliciesQueryCount, closePolicyToDelete, clearSelection, changePage,
        currentPage, selectionCount, itemsPerPage, singlePolicyToDelete
    ]);

    const tableActionsResolver = React.useCallback((policy: PolicyRow) => {
        if (!canWriteAll) {
            return [];
        }

        return [
            {
                title: policy.isEnabled ? 'Disable' : 'Enable',
                onClick: () => {
                    mutateChangePolicyEnabled({
                        policyIds: [ policy.id ],
                        shouldBeEnabled: !policy.isEnabled
                    });
                }
            },
            {
                title: 'Edit',
                onClick: () => {
                    setPolicyWizardState({
                        isOpen: true,
                        template: policy,
                        showCreateStep: false,
                        isEditing: true
                    });
                }
            },
            {
                title: 'Duplicate',
                onClick: () => {
                    setPolicyWizardState({
                        isOpen: true,
                        template: makeCopyOfPolicy(policy),
                        showCreateStep: false,
                        isEditing: false
                    });
                }
            },
            {
                title: 'Delete',
                onClick: () => {
                    openPolicyToDelete(policy);
                }
            }
        ];
    }, [ canWriteAll, openPolicyToDelete, mutateChangePolicyEnabled ]);

    React.useEffect(() => {
        if (canReadAll) {
            getPoliciesQueryReload();
        }
    }, [ canReadAll, getPoliciesQueryReload ]);

    const createCustomPolicy = React.useCallback(() => {
        setPolicyWizardState({
            isOpen: true,
            showCreateStep: true,
            template: undefined,
            isEditing: false
        });
    }, [ setPolicyWizardState ]);

    const closePolicyWizard = React.useCallback((policyCreated: boolean) => {
        const refreshUserSettings = appContext.userSettings.refresh;
        if (policyCreated) {
            getPoliciesQueryReload();
            refreshUserSettings();
        }

        setPolicyWizardState({
            isOpen: false
        });
    }, [ appContext.userSettings.refresh, setPolicyWizardState, getPoliciesQueryReload ]);

    const policyTableErrorValue = React.useMemo(
        () => {
            return policyTableError(
                {
                    clearAllFiltersAndTryAgain: () => {
                        policyFilters.setFilters[PolicyFilterColumn.NAME]('');
                        policyFilters.setFilters[PolicyFilterColumn.IS_ACTIVE]({
                            disabled: false,
                            enabled: false
                        });
                        changePage(undefined, 1);
                    },
                    refreshPage: () => {
                        window.location.reload();
                    },
                    tryAgain: () => {
                        getPoliciesQueryReload();
                    }
                },
                getPoliciesQuery.error,
                getPoliciesQuery.status
            );
        },
        [
            getPoliciesQuery.error,
            getPoliciesQuery.status,
            policyFilters.setFilters,
            changePage,
            getPoliciesQueryReload
        ]
    );

    const onDeletePolicies = React.useCallback(
        () => {
            if (selectionCount === 1) {
                const found = policyRowsRows.find(p => selected.contains(p.id));
                if (found) {
                    openPolicyToDelete(found);
                    return;
                }
            }

            openPolicyToDelete(selectionCount);
        },
        [ selectionCount, openPolicyToDelete, selected, policyRowsRows ]
    );

    const onDisablePolicies = React.useCallback(
        () => getSelected().then(ids => mutateChangePolicyEnabled({ shouldBeEnabled: false, policyIds: ids })),
        [ mutateChangePolicyEnabled, getSelected ]
    );

    const onEnablePolicies = React.useCallback(
        () => getSelected().then(ids => mutateChangePolicyEnabled({ shouldBeEnabled: true, policyIds: ids })),
        [ mutateChangePolicyEnabled, getSelected ]
    );

    const onExport = React.useCallback((_event, type) => {
        const exporter = policyExporterFactory(exporterTypeFromString(type));
        exportAllPoliciesQuery().then(response => {
            if (response.payload) {
                inBrowserDownload(
                    exporter.export(response.payload),
                    `policies-${format(new Date(), 'y-dd-MM')}.${exporter.type}`
                );
            } else {
                addDangerNotification('Unable to download policies', 'We were unable to download the policies for exporting');
            }
        });
    }, [ exportAllPoliciesQuery ]);

    return (
        <>
            <PageHeader>
                <PageHeaderTitle title={ Messages.pages.listPage.title }/>
            </PageHeader>
            { !appContext.userSettings.isSubscribedForNotifications &&
            getPoliciesQuery.payload &&
            getPoliciesQuery.payload.find(p => p.actions.find(a => a.type === ActionType.EMAIL)) && (
                <PageSection className={ emailOptinPageClassName }>
                    <EmailOptIn content={ Messages.pages.listPage.emailOptIn } />
                </PageSection>
            )}
            <Main>
                { getPoliciesQuery.hasPolicies === false ? (
                    <ListPageEmptyState
                        createPolicy={ canWriteAll ? createCustomPolicy : undefined }
                    />
                ) : (
                    <Section>
                        <PolicyToolbar
                            onCreatePolicy={ canWriteAll ? createCustomPolicy : undefined }
                            onDeletePolicy={ canWriteAll ? onDeletePolicies : undefined }
                            onEnablePolicy={ canWriteAll ? onEnablePolicies : undefined }
                            onDisablePolicy={ canWriteAll ? onDisablePolicies : undefined }
                            onPaginationChanged={ policyPage.changePage }
                            onPaginationSizeChanged={ policyPage.changeItemsPerPage }
                            onSelectionChanged={ policyRows.onSelectionChanged }
                            selectedCount={ policyRows.selectionCount }
                            page={ policyPage.page.index }
                            pageCount={ getPoliciesQuery.payload?.length }
                            perPage={ policyPage.page.size }
                            showPerPageOptions={ true }
                            filterElements={ policyFilters.filters }
                            setFilterElements = { policyFilters.setFilters }
                            clearFilters={ policyFilters.clearFilterHandler }
                            count={ getPoliciesQuery.count }
                            onExport={ onExport }
                        />
                        <PolicyTable
                            policies={ policyRows.rows }
                            onCollapse={ policyRows.onCollapse }
                            onSelect={ policyRows.onSelect }
                            actionResolver={ tableActionsResolver }
                            loading={ isLoading }
                            error={ policyTableErrorValue }
                            onSort={ sort.onSort }
                            sortBy={ sort.sortBy }
                            linkToDetailPolicy={ true }
                        />
                    </Section>
                )}
            </Main>
            { policyWizardState.isOpen && <CreatePolicyWizard
                isOpen={ policyWizardState.isOpen }
                close={ closePolicyWizard }
                initialValue={ policyWizardState.template }
                showCreateStep={ policyWizardState.showCreateStep }
                policiesExist={ getPoliciesQuery.hasPolicies === true }
                isEditing={ policyWizardState.isEditing }
            /> }
            { policyToDelete.isOpen && <DeletePolicy
                onClose={ onCloseDeletePolicy }
                onDeleted={ onDeleted }
                loading={ policyRows.loadingSelected }
                count={ policyToDelete.count }
                getPolicies={ policyRows.getSelected }
                policy={ policyToDelete.policy }
            />
            }
        </>
    );
};

export default ListPage;
